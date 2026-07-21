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
