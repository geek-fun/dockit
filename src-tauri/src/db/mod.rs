use std::path::Path;
use std::sync::{Arc, Mutex};

pub struct AgentDb(pub Arc<Mutex<rusqlite::Connection>>);

impl Clone for AgentDb {
    fn clone(&self) -> Self {
        AgentDb(Arc::clone(&self.0))
    }
}

pub fn open(path: &Path) -> Result<AgentDb, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create db dir: {}", e))?;
    }
    let conn =
        rusqlite::Connection::open(path).map_err(|e| format!("Failed to open database: {}", e))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to set pragma: {}", e))?;
    Ok(AgentDb(Arc::new(Mutex::new(conn))))
}

pub fn get_schema_version(db: &AgentDb) -> Result<i32, String> {
    let conn =
        db.0.lock()
            .map_err(|e| format!("Failed to lock db: {}", e))?;
    conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| format!("Failed to read user_version: {}", e))
}

pub fn migrate(db: &AgentDb) -> Result<(), String> {
    let conn =
        db.0.lock()
            .map_err(|e| format!("Failed to lock db: {}", e))?;

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS agent_sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'idle',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS agent_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS agent_tool_calls (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            arguments TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (message_id) REFERENCES agent_messages(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS tool_result_store (
            id TEXT PRIMARY KEY,
            tool_call_id TEXT NOT NULL,
            full_result TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (tool_call_id) REFERENCES agent_tool_calls(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_session ON agent_tool_calls(session_id);
        CREATE INDEX IF NOT EXISTS idx_tool_result_store_call ON tool_result_store(tool_call_id);
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
    .map_err(|e| format!("Failed to create initial tables: {}", e))?;

    let current_version: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| format!("Failed to read user_version: {}", e))?;

    if current_version < 1 {
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
    }

    Ok(())
}
