use data_studio_agent::storage::db::AgentDb;

/// Ensures DocKit-owned `query_history` exists on the shared agent.sqlite.
/// Called after `data_studio_agent::storage::db::migrate`, which does not create this table.
///
/// Also re-applies the agent schema v1 migration (idempotent) as a safety net for
/// databases that may predate the move of those migrations into `data_studio_agent`.
pub fn ensure_query_history(db: &AgentDb) -> Result<(), String> {
    let conn = db
        .0
        .lock()
        .map_err(|e| format!("Failed to lock db: {}", e))?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS query_history (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            database_type TEXT,
            method TEXT NOT NULL,
            path TEXT NOT NULL DEFAULT '',
            index_name TEXT,
            qdsl TEXT,
            connection_name TEXT NOT NULL,
            connection_id TEXT,
            mongo_operation TEXT,
            mongo_collection TEXT,
            mongo_database TEXT,
            mongo_duration INTEGER,
            mongo_result_count INTEGER,
            starred INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_query_history_connection ON query_history(connection_id, timestamp DESC);
        CREATE INDEX IF NOT EXISTS idx_query_history_starred ON query_history(starred) WHERE starred = 1;
        DELETE FROM query_history WHERE connection_id IS NULL;
        "#,
    )
    .map_err(|e| format!("Failed to ensure query_history table: {}", e))?;

    ensure_agent_schema_v1(&conn)?;

    Ok(())
}

/// Agent schema v1: session columns + confirmation_rules + attached_sources.
/// Safe to run after `storage::db::migrate` — skipped when `user_version >= 1`.
fn ensure_agent_schema_v1(conn: &rusqlite::Connection) -> Result<(), String> {
    let current_version: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| format!("Failed to read user_version: {}", e))?;

    if current_version >= 1 {
        return Ok(());
    }

    // Individual ALTER TABLE calls so a partially-applied migration
    // (column already exists) does not abort the whole batch.
    let alter_statements = [
        "ALTER TABLE agent_sessions ADD COLUMN sources TEXT NOT NULL DEFAULT '[]'",
        "ALTER TABLE agent_sessions ADD COLUMN permissions_mode TEXT NOT NULL DEFAULT 'Ask'",
        "ALTER TABLE agent_sessions ADD COLUMN model_id TEXT",
    ];

    for stmt in &alter_statements {
        if let Err(e) = conn.execute(stmt, []) {
            // Likely "duplicate column" — the column was already added
            // by a previous partial migration. Log and continue.
            log::warn!("[db/migrate] column may already exist: {e}");
        }
    }

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS confirmation_rules (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            action TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE,
            UNIQUE(session_id, tool_name)
        );
        CREATE TABLE IF NOT EXISTS attached_sources (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            alias TEXT,
            name TEXT,
            database_type TEXT,
            file_type TEXT,
            file_path TEXT,
            connection_id INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        "#,
    )
    .map_err(|e| format!("Failed to create version-1 tables: {e}"))?;

    conn.execute_batch("PRAGMA user_version = 1;")
        .map_err(|e| format!("Failed to set user_version: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use data_studio_agent::storage::db as storage_db;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn open_temp_db() -> AgentDb {
        let path = std::env::temp_dir().join(format!(
            "dockit-qh-{}.sqlite",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let _ = std::fs::remove_file(&path);
        storage_db::open(&path).expect("open db")
    }

    #[test]
    fn ensure_query_history_creates_table_and_is_idempotent() {
        let db = open_temp_db();
        ensure_query_history(&db).unwrap();
        ensure_query_history(&db).unwrap();

        let conn = db.0.lock().unwrap();
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='query_history'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(n, 1);
    }

    #[test]
    fn ensure_query_history_deletes_null_connection_rows() {
        let db = open_temp_db();
        ensure_query_history(&db).unwrap();

        {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "INSERT INTO query_history (id, timestamp, method, connection_name, connection_id)
                 VALUES ('a', 1, 'GET', 'c', NULL)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO query_history (id, timestamp, method, connection_name, connection_id)
                 VALUES ('b', 2, 'GET', 'c', 'conn-1')",
                [],
            )
            .unwrap();
        }

        ensure_query_history(&db).unwrap();

        let conn = db.0.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM query_history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);

        let remaining_id: String = conn
            .query_row("SELECT id FROM query_history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(remaining_id, "b");
    }

    #[test]
    fn ensure_query_history_applies_agent_schema_v1_when_needed() {
        let db = open_temp_db();
        // Create base agent_sessions without v1 columns so our safety-net path can run.
        {
            let conn = db.0.lock().unwrap();
            conn.execute_batch(
                r#"
                CREATE TABLE agent_sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'idle',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                PRAGMA user_version = 0;
                "#,
            )
            .unwrap();
        }

        ensure_query_history(&db).unwrap();

        let conn = db.0.lock().unwrap();
        let version: i32 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 1);

        let rules: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='confirmation_rules'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(rules, 1);
    }
}
