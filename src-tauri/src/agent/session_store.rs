use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::db::AgentDb;

#[derive(Serialize, Deserialize, Clone)]
pub struct AgentSession {
    pub id: String,
    pub title: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AgentMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

/// Pass-through. The frontend hydrator parses `_compact_boundary` JSON for `system` rows
/// into structured UI data; non-boundary content is returned unchanged.
fn normalize_message_content(_role: &str, content: &str) -> String {
    content.to_string()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[tauri::command]
pub async fn load_agent_sessions(db: State<'_, AgentDb>) -> Result<Vec<AgentSession>, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<AgentSession>, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, status, created_at, updated_at FROM agent_sessions ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(AgentSession {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    status: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn recover_stuck_sessions(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE agent_sessions SET status = 'idle' WHERE status = 'running'",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn create_agent_session(
    title: String,
    db: State<'_, AgentDb>,
) -> Result<AgentSession, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<AgentSession, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let session = AgentSession {
            id: new_id(),
            title,
            status: "idle".to_string(),
            created_at: now_ms(),
            updated_at: now_ms(),
        };
        conn.execute(
            "INSERT INTO agent_sessions (id, title, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![session.id, session.title, session.status, session.created_at, session.updated_at],
        )
        .map_err(|e| format!("Failed to create session: {}", e))?;
        Ok(session)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn update_session_status(
    session_id: String,
    status: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE agent_sessions SET status = ?1, updated_at = ?2 WHERE id = ?3",
            rusqlite::params![status, now_ms(), session_id],
        )
        .map_err(|e| format!("Failed to update status: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_agent_session(
    session_id: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM agent_sessions WHERE id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| format!("Failed to delete session: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clear_agent_session_messages(
    session_id: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "DELETE FROM tool_result_store WHERE tool_call_id IN (SELECT id FROM agent_tool_calls WHERE session_id = ?1)",
            rusqlite::params![session_id],
        )
        .map_err(|e| format!("Failed to clear tool results: {}", e))?;
        tx.execute(
            "DELETE FROM agent_messages WHERE session_id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| format!("Failed to clear messages: {}", e))?;
        tx.execute(
            "UPDATE agent_sessions SET status = 'idle', updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now_ms(), session_id],
        )
        .map_err(|e| format!("Failed to reset session status: {}", e))?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn load_session_messages(
    session_id: String,
    db: State<'_, AgentDb>,
) -> Result<Vec<AgentMessage>, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<AgentMessage>, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, role, content, created_at FROM agent_messages WHERE session_id = ?1 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![session_id], |row| {
                Ok(AgentMessage {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: normalize_message_content(
                        &row.get::<_, String>(2)?,
                        &row.get::<_, String>(3)?,
                    ),
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn export_agent_session(
    session_id: String,
    db: State<'_, AgentDb>,
) -> Result<Value, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let session: AgentSession = conn
            .query_row(
                "SELECT id, title, status, created_at, updated_at FROM agent_sessions WHERE id = ?1",
                rusqlite::params![session_id],
                |row| {
                    Ok(AgentSession {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        status: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                    })
                },
            )
            .map_err(|e| format!("Session not found: {}", e))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, role, content, created_at FROM agent_messages WHERE session_id = ?1 ORDER BY created_at ASC, id ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![session_id], |row| {
                Ok(AgentMessage {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    role: row.get(2)?,
                    content: normalize_message_content(
                        &row.get::<_, String>(2)?,
                        &row.get::<_, String>(3)?,
                    ),
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        let mut messages = Vec::new();
        for r in rows {
            messages.push(r.map_err(|e| e.to_string())?);
        }
        Ok(json!({"session": session, "messages": messages}))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn import_agent_session(
    data: Value,
    db: State<'_, AgentDb>,
) -> Result<AgentSession, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<AgentSession, String> {
        let session_in = data.get("session").ok_or("Missing session")?;
        let messages_in = data
            .get("messages")
            .and_then(|m| m.as_array())
            .cloned()
            .unwrap_or_default();

        let title = session_in
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Imported")
            .to_string();
        let new_session = AgentSession {
            id: new_id(),
            title,
            status: "idle".to_string(),
            created_at: now_ms(),
            updated_at: now_ms(),
        };

        let mut conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO agent_sessions (id, title, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![new_session.id, new_session.title, new_session.status, new_session.created_at, new_session.updated_at],
        )
        .map_err(|e| format!("Failed to insert session: {}", e))?;

        for msg in &messages_in {
            let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("user");
            let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let created_at = msg
                .get("created_at")
                .and_then(|v| v.as_i64())
                .unwrap_or_else(now_ms);
            tx.execute(
                "INSERT INTO agent_messages (id, session_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![new_id(), new_session.id, role, content, created_at],
            )
            .map_err(|e| format!("Failed to insert message: {}", e))?;
        }
        tx.commit().map_err(|e| e.to_string())?;
        Ok(new_session)
    })
    .await
    .map_err(|e| e.to_string())?
}
