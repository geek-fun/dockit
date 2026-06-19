use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use data_studio_agent::storage::db::AgentDb;

#[derive(Serialize, Deserialize, Clone)]
pub struct AgentSession {
    pub id: String,
    pub title: String,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub sources: String,
    pub permissions_mode: String,
    pub model_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct ConfirmationRuleRow {
    pub id: String,
    pub session_id: String,
    pub tool_name: String,
    pub action: String,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct AttachedSourceRow {
    pub id: String,
    pub kind: String,
    pub alias: Option<String>,
    pub name: Option<String>,
    pub database_type: Option<String>,
    pub file_type: Option<String>,
    pub file_path: Option<String>,
    pub connection_id: Option<i64>,
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
                "SELECT id, title, status, created_at, updated_at, sources, permissions_mode, model_id FROM agent_sessions ORDER BY updated_at DESC",
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
                    sources: row.get(5)?,
                    permissions_mode: row.get(6)?,
                    model_id: row.get(7)?,
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
pub async fn create_agent_session(
    title: String,
    sources: Option<String>,
    permissions_mode: Option<String>,
    model_id: Option<String>,
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
            sources: sources.unwrap_or_else(|| "[]".to_string()),
            permissions_mode: permissions_mode.unwrap_or_else(|| "Ask".to_string()),
            model_id,
        };
        conn.execute(
            "INSERT INTO agent_sessions (id, title, status, created_at, updated_at, sources, permissions_mode, model_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![session.id, session.title, session.status, session.created_at, session.updated_at, session.sources, session.permissions_mode, session.model_id],
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
                "SELECT id, title, status, created_at, updated_at, sources, permissions_mode, model_id FROM agent_sessions WHERE id = ?1",
                rusqlite::params![session_id],
                |row| {
                    Ok(AgentSession {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        status: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                        sources: row.get(5)?,
                        permissions_mode: row.get(6)?,
                        model_id: row.get(7)?,
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
        let sources = session_in
            .get("sources")
            .and_then(|v| v.as_str())
            .unwrap_or("[]")
            .to_string();
        let permissions_mode = session_in
            .get("permissions_mode")
            .and_then(|v| v.as_str())
            .unwrap_or("Ask")
            .to_string();
        let model_id = session_in.get("model_id").and_then(|v| v.as_str()).map(|s| s.to_string());
        let new_session = AgentSession {
            id: new_id(),
            title,
            status: "idle".to_string(),
            created_at: now_ms(),
            updated_at: now_ms(),
            sources,
            permissions_mode,
            model_id,
        };

        let mut conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute(
            "INSERT INTO agent_sessions (id, title, status, created_at, updated_at, sources, permissions_mode, model_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![new_session.id, new_session.title, new_session.status, new_session.created_at, new_session.updated_at, new_session.sources, new_session.permissions_mode, new_session.model_id],
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

#[tauri::command]
pub async fn update_session_meta(
    session_id: String,
    sources: Option<String>,
    permissions_mode: Option<String>,
    model_id: Option<String>,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;

        let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut set_clauses: Vec<String> = Vec::new();

        if let Some(ref val) = sources {
            set_clauses.push(format!("sources = ?{}", params.len() + 1));
            params.push(Box::new(val.clone()));
        }
        if let Some(ref val) = permissions_mode {
            set_clauses.push(format!("permissions_mode = ?{}", params.len() + 1));
            params.push(Box::new(val.clone()));
        }
        if let Some(ref val) = model_id {
            set_clauses.push(format!("model_id = ?{}", params.len() + 1));
            params.push(Box::new(val.clone()));
        }

        if !set_clauses.is_empty() {
            set_clauses.push(format!("updated_at = ?{}", params.len() + 1));
            params.push(Box::new(now_ms()));
            params.push(Box::new(session_id.clone()));
            let sql = format!(
                "UPDATE agent_sessions SET {} WHERE id = ?{}",
                set_clauses.join(", "),
                params.len()
            );
            conn.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))
                .map_err(|e| format!("Failed to update session meta: {}", e))?;
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn load_confirmation_rules(
    session_id: String,
    db: State<'_, AgentDb>,
) -> Result<Vec<ConfirmationRuleRow>, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<ConfirmationRuleRow>, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, tool_name, action, created_at FROM confirmation_rules WHERE session_id = ?1 ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![session_id], |row| {
                Ok(ConfirmationRuleRow {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    tool_name: row.get(2)?,
                    action: row.get(3)?,
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
pub async fn save_confirmation_rule(
    session_id: String,
    tool_name: String,
    action: String,
    db: State<'_, AgentDb>,
) -> Result<ConfirmationRuleRow, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<ConfirmationRuleRow, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let row = ConfirmationRuleRow {
            id: new_id(),
            session_id,
            tool_name,
            action,
            created_at: now_ms(),
        };
        conn.execute(
            "INSERT OR REPLACE INTO confirmation_rules (id, session_id, tool_name, action, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![row.id, row.session_id, row.tool_name, row.action, row.created_at],
        )
        .map_err(|e| format!("Failed to save confirmation rule: {}", e))?;
        Ok(row)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_confirmation_rule(
    id: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM confirmation_rules WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| format!("Failed to delete confirmation rule: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clear_session_confirmation_rules(
    session_id: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM confirmation_rules WHERE session_id = ?1",
            rusqlite::params![session_id],
        )
        .map_err(|e| format!("Failed to clear confirmation rules: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn load_attached_sources(
    db: State<'_, AgentDb>,
) -> Result<Vec<AttachedSourceRow>, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<AttachedSourceRow>, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, kind, alias, name, database_type, file_type, file_path, connection_id, created_at, updated_at FROM attached_sources ORDER BY created_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(AttachedSourceRow {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    alias: row.get(2)?,
                    name: row.get(3)?,
                    database_type: row.get(4)?,
                    file_type: row.get(5)?,
                    file_path: row.get(6)?,
                    connection_id: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
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
pub async fn save_attached_source(
    id: String,
    kind: String,
    alias: Option<String>,
    name: Option<String>,
    database_type: Option<String>,
    file_type: Option<String>,
    file_path: Option<String>,
    connection_id: Option<i64>,
    created_at: Option<i64>,
    updated_at: Option<i64>,
    db: State<'_, AgentDb>,
) -> Result<AttachedSourceRow, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<AttachedSourceRow, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let now = now_ms();
        // If created_at is not provided, preserve the existing value from DB
        // (for updates) or use current time for genuinely new rows.
        let resolved_created_at = if created_at.is_none() {
            conn.query_row(
                "SELECT created_at FROM attached_sources WHERE id = ?1",
                rusqlite::params![&id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(now)
        } else {
            created_at.unwrap()
        };
        let row = AttachedSourceRow {
            id,
            kind,
            alias,
            name,
            database_type,
            file_type,
            file_path,
            connection_id,
            created_at: resolved_created_at,
            updated_at: updated_at.unwrap_or(now),
        };
        conn.execute(
            "INSERT OR REPLACE INTO attached_sources (id, kind, alias, name, database_type, file_type, file_path, connection_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![row.id, row.kind, row.alias, row.name, row.database_type, row.file_type, row.file_path, row.connection_id, row.created_at, row.updated_at],
        )
        .map_err(|e| format!("Failed to save attached source: {}", e))?;
        Ok(row)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_attached_source(
    id: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM attached_sources WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| format!("Failed to delete attached source: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn migrate_session_metadata(
    session_meta: String,
    confirmation_rules: String,
    attached_sources: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let mut conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // Parse session_meta — Record<string, {sources, permissionsMode, maxIterations, title, updatedAt, modelId}>
        let meta: Value = serde_json::from_str(&session_meta).map_err(|e| e.to_string())?;
        if let Value::Object(map) = &meta {
            for (session_id, fields) in map {
                let now = now_ms();
                if let Value::Object(field_map) = fields {
                    let sources = field_map.get("sources").and_then(|v| v.as_str()).unwrap_or("[]");
                    let permissions_mode = field_map.get("permissionsMode").and_then(|v| v.as_str()).unwrap_or("Ask");
                    let model_id = field_map.get("modelId").and_then(|v| v.as_str());

                    let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
                    let mut set_clauses: Vec<String> = Vec::new();

                    set_clauses.push(format!("sources = ?{}", params.len() + 1));
                    params.push(Box::new(sources.to_string()));
                    set_clauses.push(format!("permissions_mode = ?{}", params.len() + 1));
                    params.push(Box::new(permissions_mode.to_string()));
                    set_clauses.push(format!("updated_at = ?{}", params.len() + 1));
                    params.push(Box::new(now));

                    if let Some(mid) = model_id {
                        set_clauses.push(format!("model_id = ?{}", params.len() + 1));
                        params.push(Box::new(mid.to_string()));
                    } else {
                        set_clauses.push("model_id = NULL".to_string());
                    }

                    let sid = session_id.clone();
                    let sql = format!(
                        "UPDATE agent_sessions SET {} WHERE id = ?{}",
                        set_clauses.join(", "),
                        params.len() + 1
                    );
                    params.push(Box::new(sid));
                    tx.execute(&sql, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())))
                        .map_err(|e| e.to_string())?;
                }
            }
        }

        // Parse confirmation_rules — Array<{sessionId, toolName, action}>
        let rules: Value = serde_json::from_str(&confirmation_rules).map_err(|e| e.to_string())?;
        if let Value::Array(arr) = &rules {
            for entry in arr {
                if let Value::Object(obj) = entry {
                    let sid = obj.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                    let tool = obj.get("toolName").and_then(|v| v.as_str()).unwrap_or("");
                    let action = obj.get("action").and_then(|v| v.as_str()).unwrap_or("");
                    tx.execute(
                        "INSERT INTO confirmation_rules (id, session_id, tool_name, action, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![new_id(), sid, tool, action, now_ms()],
                    )
                    .map_err(|e| format!("Failed to insert confirmation rule: {}", e))?;
                }
            }
        }

        // Parse attached_sources — Array<{id, kind, alias, name, databaseType, fileType, filePath, connectionId}>
        let sources_val: Value = serde_json::from_str(&attached_sources).map_err(|e| e.to_string())?;
        if let Value::Array(arr) = &sources_val {
            for entry in arr {
                if let Value::Object(obj) = entry {
                    let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    let kind = obj.get("kind").and_then(|v| v.as_str()).unwrap_or("");
                    let alias = obj.get("alias").and_then(|v| v.as_str());
                    let name = obj.get("name").and_then(|v| v.as_str());
                    let database_type = obj.get("databaseType").and_then(|v| v.as_str());
                    let file_type = obj.get("fileType").and_then(|v| v.as_str());
                    let file_path = obj.get("filePath").and_then(|v| v.as_str());
                    let connection_id = obj.get("connectionId").and_then(|v| v.as_i64());
                    let now = now_ms();
                    tx.execute(
                        "INSERT OR REPLACE INTO attached_sources (id, kind, alias, name, database_type, file_type, file_path, connection_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                        rusqlite::params![id, kind, alias, name, database_type, file_type, file_path, connection_id, now, now],
                    )
                    .map_err(|e| format!("Failed to insert attached source: {}", e))?;
                }
            }
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
