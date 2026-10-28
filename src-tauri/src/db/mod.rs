use crate::agent::session_store::now_ms;
use data_studio_agent::storage::db::AgentDb;
use serde_json::Value;
use tauri_plugin_store::StoreExt;

/// Ensures DocKit-owned `query_history` exists on the shared agent.sqlite.
/// Called after `data_studio_agent::storage::db::migrate`, which does not create this table.
///
/// Also re-applies the agent schema v1 migration (idempotent) as a safety net for
/// databases that may predate the move of those migrations into `data_studio_agent`.
pub fn ensure_query_history(db: &AgentDb) -> Result<(), String> {
    let conn =
        db.0.lock()
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

/// Repairs `attached_sources` rows persisted before the argument-case fix in
/// `saveAttachedSource`. Those rows carry no connection binding, which makes
/// Data Studio authorization treat the source as detached. A binding is
/// recovered only from an unambiguous saved-connection name match; unknown or
/// ambiguous names stay unbound so the source fails closed.
pub fn repair_unbound_attached_sources<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    db: &AgentDb,
) -> Result<usize, String> {
    let store = app.store(".store.dat").map_err(|e| e.to_string())?;
    let connections = store
        .get("connections")
        .and_then(|value| value.as_array().cloned())
        .unwrap_or_default();
    let conn =
        db.0.lock()
            .map_err(|e| format!("Failed to lock db: {}", e))?;
    repair_unbound_attached_sources_in(&conn, &connections)
}

fn repair_unbound_attached_sources_in(
    conn: &rusqlite::Connection,
    connections: &[Value],
) -> Result<usize, String> {
    let rows: Vec<(String, String)> = conn
        .prepare(
            "SELECT id, name FROM attached_sources WHERE kind = 'database' AND connection_id IS NULL",
        )
        .map_err(|e| format!("Failed to read attached sources: {}", e))?
        .query_map([], |row| Ok((row.get(0)?, row.get::<_, Option<String>>(1)?)))
        .map_err(|e| format!("Failed to read attached sources: {}", e))?
        .filter_map(|row| match row {
            Ok((id, Some(name))) => Some(Ok((id, name))),
            Ok((_, None)) => None,
            Err(error) => Some(Err(error)),
        })
        .collect::<Result<_, _>>()
        .map_err(|e| format!("Failed to read attached sources: {}", e))?;

    let mut repaired = 0;
    for (id, name) in rows {
        let Some((connection_id, database_type)) = matching_connection(connections, &name) else {
            continue;
        };
        conn.execute(
            "UPDATE attached_sources SET connection_id = ?1, database_type = ?2, updated_at = ?3 WHERE id = ?4",
            rusqlite::params![connection_id, database_type, now_ms(), id],
        )
        .map_err(|e| format!("Failed to repair attached source {}: {}", id, e))?;
        repaired += 1;
    }
    Ok(repaired)
}

/// A name match is only usable when exactly one saved connection carries it and
/// its id can be stored in the integer `connection_id` column.
fn matching_connection<'a>(connections: &'a [Value], name: &str) -> Option<(i64, Option<&'a str>)> {
    let mut matched: Option<(i64, Option<&str>)> = None;
    for connection in connections {
        if connection.get("name").and_then(Value::as_str) != Some(name) {
            continue;
        }
        let Some(id) = connection_id(connection) else {
            continue;
        };
        if matched.is_some() {
            return None;
        }
        matched = Some((id, connection.get("type").and_then(Value::as_str)));
    }
    matched
}

fn connection_id(connection: &Value) -> Option<i64> {
    match connection.get("id")? {
        Value::Number(id) => id.as_i64(),
        Value::String(id) => id.parse().ok(),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use data_studio_agent::storage::db as storage_db;
    use serde_json::json;
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
    fn repairs_unbound_database_sources_from_an_unambiguous_connection_name() {
        let db = open_temp_db();
        ensure_query_history(&db).unwrap();
        let conn = db.0.lock().unwrap();
        conn.execute_batch(
            r#"
            INSERT INTO attached_sources (id, kind, alias, name, created_at, updated_at) VALUES
                ('s1', 'database', 'prod', 'prod', 0, 0),
                ('s2', 'database', 'dup', 'dup', 0, 0),
                ('s3', 'database', 'gone', 'gone', 0, 0),
                ('s4', 'database', 'numeric', 'numeric', 0, 0);
            "#,
        )
        .unwrap();

        let connections = vec![
            json!({"id": 12, "name": "prod", "type": "DYNAMODB"}),
            json!({"id": "20", "name": "dup", "type": "ELASTICSEARCH"}),
            json!({"id": 21, "name": "dup", "type": "MONGODB"}),
            json!({"id": "30", "name": "numeric", "type": "EASYSEARCH"}),
        ];
        assert_eq!(
            repair_unbound_attached_sources_in(&conn, &connections).unwrap(),
            2
        );

        let (id, database_type): (i64, String) = conn
            .query_row(
                "SELECT connection_id, database_type FROM attached_sources WHERE id = 's1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!((id, database_type.as_str()), (12, "DYNAMODB"));
        let string_id: i64 = conn
            .query_row(
                "SELECT connection_id FROM attached_sources WHERE id = 's4'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(string_id, 30);

        for source in ["s2", "s3"] {
            let unbound: bool = conn
                .query_row(
                    "SELECT connection_id IS NULL FROM attached_sources WHERE id = ?1",
                    [source],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(unbound, "{source} must stay unbound");
        }
        assert_eq!(
            repair_unbound_attached_sources_in(&conn, &connections).unwrap(),
            0
        );
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
