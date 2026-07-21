use data_studio_agent::storage::db::AgentDb;

/// Ensures DocKit-owned `query_history` exists on the shared agent.sqlite.
/// Called after `data_studio_agent::storage::db::migrate`, which does not create this table.
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
}
