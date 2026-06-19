use serde::{Deserialize, Serialize};
use tauri::State;

use data_studio_agent::storage::db::AgentDb;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct QueryHistoryEntry {
    pub id: String,
    pub timestamp: i64,
    pub database_type: Option<String>,
    pub method: String,
    pub path: String,
    pub index_name: Option<String>,
    pub qdsl: Option<String>,
    pub connection_name: String,
    pub connection_id: String,
    pub mongo_operation: Option<String>,
    pub mongo_collection: Option<String>,
    pub mongo_database: Option<String>,
    pub mongo_duration: Option<i64>,
    pub mongo_result_count: Option<i64>,
    pub starred: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddQueryHistoryInput {
    pub database_type: Option<String>,
    pub method: String,
    pub path: String,
    pub index_name: Option<String>,
    pub qdsl: Option<String>,
    pub connection_name: String,
    pub connection_id: String,
    pub mongo_operation: Option<String>,
    pub mongo_collection: Option<String>,
    pub mongo_database: Option<String>,
    pub mongo_duration: Option<i64>,
    pub mongo_result_count: Option<i64>,
    pub history_cap: i64,
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
pub async fn load_query_history(db: State<'_, AgentDb>) -> Result<Vec<QueryHistoryEntry>, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<QueryHistoryEntry>, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, timestamp, database_type, method, path, index_name, qdsl, \
                 connection_name, connection_id, mongo_operation, mongo_collection, \
                 mongo_database, mongo_duration, mongo_result_count, starred \
                 FROM query_history ORDER BY timestamp DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(QueryHistoryEntry {
                    id: row.get(0)?,
                    timestamp: row.get(1)?,
                    database_type: row.get(2)?,
                    method: row.get(3)?,
                    path: row.get(4)?,
                    index_name: row.get(5)?,
                    qdsl: row.get(6)?,
                    connection_name: row.get(7)?,
                    connection_id: row.get(8)?,
                    mongo_operation: row.get(9)?,
                    mongo_collection: row.get(10)?,
                    mongo_database: row.get(11)?,
                    mongo_duration: row.get(12)?,
                    mongo_result_count: row.get(13)?,
                    starred: row.get::<_, i64>(14)? != 0,
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
pub async fn add_query_history_entry(
    input: AddQueryHistoryInput,
    db: State<'_, AgentDb>,
) -> Result<QueryHistoryEntry, String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<QueryHistoryEntry, String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        let entry = QueryHistoryEntry {
            id: new_id(),
            timestamp: now_ms(),
            database_type: input.database_type,
            method: input.method,
            path: input.path,
            index_name: input.index_name,
            qdsl: input.qdsl,
            connection_name: input.connection_name,
            connection_id: input.connection_id,
            mongo_operation: input.mongo_operation,
            mongo_collection: input.mongo_collection,
            mongo_database: input.mongo_database,
            mongo_duration: input.mongo_duration,
            mongo_result_count: input.mongo_result_count,
            starred: false,
        };
        conn.execute(
            "INSERT INTO query_history (id, timestamp, database_type, method, path, index_name, \
             qdsl, connection_name, connection_id, mongo_operation, mongo_collection, \
             mongo_database, mongo_duration, mongo_result_count, starred) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                entry.id,
                entry.timestamp,
                entry.database_type,
                entry.method,
                entry.path,
                entry.index_name,
                entry.qdsl,
                entry.connection_name,
                entry.connection_id,
                entry.mongo_operation,
                entry.mongo_collection,
                entry.mongo_database,
                entry.mongo_duration,
                entry.mongo_result_count,
                0i64,
            ],
        )
        .map_err(|e| format!("Failed to insert query history entry: {}", e))?;

        // Cap enforcement: keep only the latest `history_cap` entries for this connection.
        // The cap is at minimum 1 to prevent accidental destruction.
        let cap = input.history_cap.max(1);
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM query_history WHERE connection_id = ?1",
                rusqlite::params![entry.connection_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if count > cap {
            conn.execute(
                // LIMIT -1 means "no limit" in SQLite — delete all rows beyond the cap.
                "DELETE FROM query_history WHERE id IN ( \
                 SELECT id FROM query_history WHERE connection_id = ?1 \
                 ORDER BY timestamp DESC LIMIT -1 OFFSET ?2)",
                rusqlite::params![entry.connection_id, cap],
            )
            .map_err(|e| format!("Failed to enforce query history cap: {}", e))?;
        }

        Ok(entry)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn toggle_query_history_star(
    id: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE query_history SET starred = CASE WHEN starred = 0 THEN 1 ELSE 0 END WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| format!("Failed to toggle star: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_query_history_entry(
    id: String,
    db: State<'_, AgentDb>,
) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM query_history WHERE id = ?1",
            rusqlite::params![id],
        )
        .map_err(|e| format!("Failed to delete query history entry: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn clear_query_history(db: State<'_, AgentDb>) -> Result<(), String> {
    let conn_arc = db.0.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let conn = conn_arc.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM query_history", [])
            .map_err(|e| format!("Failed to clear query history: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
