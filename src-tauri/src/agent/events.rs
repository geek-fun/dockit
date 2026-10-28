use std::sync::Mutex;

use data_studio_agent::traits::{CancelMap, EventEmitter};
use serde_json::Value;

use crate::ai_permissions::AccessDenial;

pub(crate) struct AgentRunEmitter<E> {
    pub inner: E,
    pub cancel_map: CancelMap,
    pub blocked: Mutex<Option<Value>>,
}

impl<E: EventEmitter> EventEmitter for AgentRunEmitter<E> {
    fn emit(&self, event: &str, mut payload: Value) {
        if event == "agent-loop-tool-result"
            && (payload["denied"] == true
                || (payload["error"] == true
                    && AccessDenial::decode(payload["envelope"]["summary"].as_str().unwrap_or(""))
                        .is_some()))
        {
            let denial = AccessDenial::from_message(
                payload["envelope"]["summary"]
                    .as_str()
                    .unwrap_or("Access denied"),
            );
            payload["envelope"]["summary"] = Value::String(denial.message.clone());
            payload["denial"] = serde_json::to_value(&denial).unwrap();
            if matches!(denial.kind.as_str(), "unavailable" | "invalid_input") {
                payload["denied"] = Value::Bool(false);
                payload["error"] = Value::Bool(true);
            }
            if !matches!(denial.kind.as_str(), "user" | "invalid_input") {
                let mut blocked = self
                    .blocked
                    .lock()
                    .unwrap_or_else(|error| error.into_inner());
                if blocked.is_none() {
                    *blocked = Some(payload.clone());
                    if let Some(session) = payload["session_id"].as_str() {
                        // Use the runtime's cancellation boundary after it records the denied result.
                        let _ = data_studio_agent::loop_runner::cancel_agent_loop(
                            session,
                            &self.cancel_map,
                        );
                    }
                }
            }
        }
        let blocked = self
            .blocked
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .is_some();
        if blocked
            && (event == "agent-loop-done"
                || event == "agent-loop-iteration"
                || (event == "agent-loop-error" && payload["error"] == "cancelled"))
        {
            return;
        }
        self.inner.emit(event, payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::{collections::HashMap, sync::Arc};

    #[derive(Default)]
    struct Events(Mutex<Vec<(String, Value)>>);
    impl EventEmitter for Events {
        fn emit(&self, event: &str, payload: Value) {
            self.0.lock().unwrap().push((event.into(), payload));
        }
    }

    #[test]
    fn permission_denial_cancels_further_work_without_hiding_the_result() {
        let (tx, mut rx) = tokio::sync::oneshot::channel();
        let emitter = AgentRunEmitter {
            inner: Events::default(),
            cancel_map: Arc::new(Mutex::new(HashMap::from([("chat".into(), tx)]))),
            blocked: Mutex::new(None),
        };
        let denial = AccessDenial::permission(
            crate::ai_permissions::Permission::Manage,
            "db",
            "connection",
        );
        emitter.emit("agent-loop-tool-result", json!({"session_id":"chat","tool_call_id":"call","denied":true,"envelope":{"summary":denial.encode()}}));
        assert_eq!(rx.try_recv(), Ok(()));
        emitter.emit("agent-loop-error", json!({"error":"cancelled"}));
        emitter.emit("agent-loop-iteration", json!({}));
        let events = emitter.inner.0.lock().unwrap();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].1["denial"]["source"], "connection");
        assert_eq!(events[0].1["envelope"]["summary"], denial.message);
        assert!(emitter.blocked.lock().unwrap().is_some());
    }

    #[test]
    fn user_rejection_does_not_become_a_permission_block() {
        let emitter = AgentRunEmitter {
            inner: Events::default(),
            cancel_map: Arc::new(Mutex::new(HashMap::new())),
            blocked: Mutex::new(None),
        };
        emitter.emit(
            "agent-loop-tool-result",
            json!({"denied":true,"envelope":{"summary":"Tool call was not approved"}}),
        );
        assert!(emitter.blocked.lock().unwrap().is_none());
        assert_eq!(
            emitter.inner.0.lock().unwrap()[0].1["denial"]["kind"],
            "user"
        );
    }

    #[test]
    fn unavailable_stops_as_an_error_and_invalid_input_can_be_corrected() {
        for (kind, stops) in [("unavailable", true), ("invalid_input", false)] {
            let (tx, mut rx) = tokio::sync::oneshot::channel();
            let emitter = AgentRunEmitter {
                inner: Events::default(),
                cancel_map: Arc::new(Mutex::new(HashMap::from([("chat".into(), tx)]))),
                blocked: Mutex::new(None),
            };
            let error = AccessDenial::other(kind, "unknown", "Synthetic failure");
            emitter.emit(
                "agent-loop-tool-result",
                json!({"session_id":"chat","denied":true,"envelope":{"summary":error.encode()}}),
            );
            assert_eq!(emitter.blocked.lock().unwrap().is_some(), stops);
            assert_eq!(rx.try_recv().is_ok(), stops);
            let events = emitter.inner.0.lock().unwrap();
            assert_eq!(events[0].1["denied"], false);
            assert_eq!(events[0].1["error"], true);
            assert_eq!(events[0].1["denial"]["kind"], kind);
        }
    }

    #[tokio::test]
    async fn denied_preflight_persists_result_and_stops_before_another_model_turn() {
        use async_trait::async_trait;
        use data_studio_agent::{
            storage::{db::AgentDb, session_store::SqliteSessionStore},
            tool_executor::{ToolCallPreparation, ToolEnvelope, ToolExecutor},
        };
        use std::sync::atomic::{AtomicUsize, Ordering};

        struct Deny;
        #[async_trait]
        impl ToolExecutor for Deny {
            fn prepare(
                &self,
                _: &str,
                _: &Value,
                _: &Value,
                _: &HashMap<String, Value>,
            ) -> Result<ToolCallPreparation, String> {
                Err(AccessDenial::permission(
                    crate::ai_permissions::Permission::Manage,
                    "db",
                    "system",
                )
                .encode())
            }
            async fn execute(&self, _: &str, _: &Value, _: &Value) -> Result<ToolEnvelope, String> {
                panic!("a blocked action must not execute")
            }
        }

        let requests = Arc::new(AtomicUsize::new(0));
        let count = requests.clone();
        let response = format!(
            "data: {}\n\ndata: {}\n\ndata: [DONE]\n\n",
            json!({"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call","type":"function","function":{"name":"es__create_index","arguments":"{\"connection_id\":\"db\",\"index\":\"example\"}"}}]}}]}),
            json!({"choices":[{"delta":{},"finish_reason":"tool_calls"}]})
        );
        let router = axum::Router::new().route(
            "/v1/chat/completions",
            axum::routing::post(move || {
                count.fetch_add(1, Ordering::SeqCst);
                let response = response.clone();
                async move { ([("content-type", "text/event-stream")], response) }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, router).await.unwrap() });
        let db = AgentDb(Arc::new(Mutex::new(
            rusqlite::Connection::open_in_memory().unwrap(),
        )));
        data_studio_agent::storage::db::migrate(&db).unwrap();
        db.0.lock().unwrap().execute("INSERT INTO agent_sessions (id,title,created_at,updated_at) VALUES ('chat','Chat',0,0)", []).unwrap();
        let cancel_map = Arc::new(Mutex::new(HashMap::new()));
        let emitter = AgentRunEmitter {
            inner: Events::default(),
            cancel_map: cancel_map.clone(),
            blocked: Mutex::new(None),
        };
        let settings = json!({"baseUrl":format!("http://{address}"),"model":"gpt-4o-mini","apiKey":"synthetic","proxyMode":"none","tools":[{"type":"function","function":{"name":"es__create_index","parameters":{"type":"object"}}}],"maxIterations":3});
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            data_studio_agent::loop_runner::run_agent_loop(
                "chat",
                "Create example",
                &settings,
                &SqliteSessionStore::new(db.clone()),
                &emitter,
                &Deny,
                HashMap::from([("db".into(), json!({"connectionId":"db"}))]),
                Value::Null,
                &Arc::new(Mutex::new(HashMap::new())),
                &cancel_map,
                &|_| false,
                &|_, _| false,
            ),
        )
        .await
        .expect("a preflight denial must stop the run before another model request");
        server.abort();
        assert_eq!(result.unwrap_err(), "cancelled");
        assert_eq!(requests.load(Ordering::SeqCst), 1);
        assert!(emitter.blocked.lock().unwrap().is_some());
        let conn = db.0.lock().unwrap();
        let status: String = conn
            .query_row(
                "SELECT status FROM agent_tool_calls WHERE id='call'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, "denied");
        let result_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM agent_messages WHERE role='tool'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(result_count, 1);
    }
}
