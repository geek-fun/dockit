use std::path::Path;
use std::sync::{Arc, Mutex};

pub struct AgentDb(pub Arc<Mutex<rusqlite::Connection>>);

pub fn open(path: &Path) -> Result<AgentDb, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create db dir: {}", e))?;
    }
    let conn = rusqlite::Connection::open(path)
        .map_err(|e| format!("Failed to open database: {}", e))?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("Failed to set pragma: {}", e))?;
    Ok(AgentDb(Arc::new(Mutex::new(conn))))
}

pub fn migrate(db: &AgentDb) -> Result<(), String> {
    let conn = db
        .0
        .lock()
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
        "#,
    )
    .map_err(|e| format!("Failed to migrate db: {}", e))?;
    Ok(())
}
