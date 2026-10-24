use super::PermissionRules;
use data_studio_agent::{capabilities::types::RiskLevel, storage::db::AgentDb};
use rusqlite::OptionalExtension;
use serde_json::Value;
use std::collections::HashMap;

pub(crate) struct AgentAccess {
    pub session_id: String,
    pub connections: HashMap<String, Value>,
    pub studio: bool,
    pub db: AgentDb,
}

pub(super) struct SessionAccess {
    pub restrictions: HashMap<String, PermissionRules>,
    pub(super) mode: String,
    pub(super) rule: Option<ConfirmationRuleAction>,
}

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum ConfirmationRuleAction {
    AllowAlways,
    DenyAlways,
}

impl AgentAccess {
    pub(super) fn current(&self, tool: &str) -> Result<SessionAccess, String> {
        let db = self.db.0.lock().map_err(|e| e.to_string())?;
        let (sources, mode): (String, String) = db
            .query_row(
                "SELECT sources, permissions_mode FROM agent_sessions WHERE id = ?1",
                [&self.session_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|e| format!("Cannot load current conversation permissions: {e}"))?;
        let sources: Vec<Value> = serde_json::from_str(&sources).map_err(|e| e.to_string())?;
        let rule: Option<String> = db
            .query_row(
                "SELECT action FROM confirmation_rules WHERE session_id = ?1 AND tool_name = ?2",
                [&self.session_id, tool],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let rule = rule
            .map(|action| serde_json::from_value(Value::String(action)))
            .transpose()
            .map_err(|e| format!("Cannot load current confirmation rule: {e}"))?;
        let mut restrictions = HashMap::new();
        for config in self.connections.values() {
            let Some(id) = config.get("connectionId").and_then(Value::as_str) else {
                continue;
            };
            let permission = if self.studio {
                let Some(source_id) = config.get("sourceId").and_then(Value::as_str) else {
                    continue;
                };
                let Some(source) = sources.iter().find(|source| {
                    source.get("sourceId").and_then(Value::as_str) == Some(source_id)
                        && source.get("detached").and_then(Value::as_bool) != Some(true)
                        && source.get("kind").and_then(Value::as_str) == Some("database")
                }) else {
                    continue;
                };
                let attached_id: Option<String> = db.query_row(
                    "SELECT CAST(connection_id AS TEXT) FROM attached_sources WHERE id = ?1 AND kind = 'database'",
                    [source_id], |row| row.get(0),
                ).optional().map_err(|e| e.to_string())?.flatten();
                if attached_id.as_deref() != Some(id) {
                    continue;
                }
                if source.get("permissionsMode").and_then(Value::as_str) == Some("custom") {
                    serde_json::from_value(
                        source
                            .get("permissions")
                            .cloned()
                            .ok_or("Missing source permissions")?,
                    )
                    .map_err(|e| e.to_string())?
                } else {
                    PermissionRules::explicit(true, true, true, true, true)
                }
            } else {
                PermissionRules::explicit(true, true, true, true, true)
            };
            // A connection attached more than once must satisfy every attachment's limits.
            restrictions
                .entry(id.to_owned())
                .and_modify(|existing: &mut PermissionRules| {
                    *existing = intersect(existing, &permission);
                })
                .or_insert(permission);
        }
        Ok(SessionAccess {
            restrictions,
            mode,
            rule,
        })
    }
}

fn intersect(a: &PermissionRules, b: &PermissionRules) -> PermissionRules {
    let combine = |a: Option<bool>, b: Option<bool>| {
        if a == Some(false) || b == Some(false) {
            Some(false)
        } else {
            a.or(b)
        }
    };
    PermissionRules {
        read: combine(a.read, b.read),
        create: combine(a.create, b.create),
        update: combine(a.update, b.update),
        delete: combine(a.delete, b.delete),
        // Custom conversation permissions must explicitly grant manage.
        manage: Some(a.manage == Some(true) && b.manage == Some(true)),
    }
}

impl SessionAccess {
    pub fn confirmation_required(&self, risk: RiskLevel) -> Result<bool, String> {
        match self.rule {
            Some(ConfirmationRuleAction::DenyAlways) => {
                Err("Tool call denied by conversation rule".into())
            }
            Some(ConfirmationRuleAction::AllowAlways) => Ok(false),
            None => Ok(match risk {
                RiskLevel::Safe => false,
                RiskLevel::Destructive => true,
                RiskLevel::Elevated => self.mode != "Auto",
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::{Arc, Mutex};

    fn setup(studio: bool) -> AgentAccess {
        let db = AgentDb(Arc::new(Mutex::new(
            rusqlite::Connection::open_in_memory().unwrap(),
        )));
        data_studio_agent::storage::db::migrate(&db).unwrap();
        db.0.lock().unwrap().execute_batch("INSERT INTO agent_sessions (id,title,created_at,updated_at,permissions_mode) VALUES ('chat','Chat',0,0,'Auto'); INSERT INTO attached_sources (id,kind,connection_id,created_at,updated_at) VALUES ('source','database',42,0,0);").unwrap();
        let access = AgentAccess {
            session_id: "chat".into(),
            studio,
            db,
            connections: HashMap::from([(
                "alias".into(),
                json!({
                    "connectionId":"42", "sourceId":"source", "permissions":{"read":true}
                }),
            )]),
        };
        sources(
            &access,
            json!([{"sourceId":"source","kind":"database","permissionsMode":"inherit"}]),
        );
        access
    }

    fn sources(access: &AgentAccess, value: Value) {
        access
            .db
            .0
            .lock()
            .unwrap()
            .execute(
                "UPDATE agent_sessions SET sources=?1 WHERE id='chat'",
                [value.to_string()],
            )
            .unwrap();
    }

    #[test]
    fn reloads_source_restrictions_instead_of_the_run_snapshot() {
        let access = setup(true);
        assert_eq!(
            access.current("tool").unwrap().restrictions["42"].read,
            Some(true)
        );
        sources(
            &access,
            json!([{"sourceId":"source","kind":"database","permissionsMode":"custom","permissions":{"read":false,"update":true}}]),
        );
        let current = access.current("tool").unwrap();
        assert_eq!(current.restrictions["42"].read, Some(false));
        assert_eq!(current.restrictions["42"].update, Some(true));
        assert_eq!(current.restrictions["42"].manage, None);
    }

    #[test]
    fn detaching_or_deleting_a_source_revokes_queued_access() {
        let access = setup(true);
        sources(
            &access,
            json!([{"sourceId":"source","kind":"database","detached":true}]),
        );
        assert!(access.current("tool").unwrap().restrictions.is_empty());
        sources(
            &access,
            json!([{"sourceId":"source","kind":"database","permissionsMode":"inherit"}]),
        );
        access
            .db
            .0
            .lock()
            .unwrap()
            .execute("DELETE FROM attached_sources", [])
            .unwrap();
        assert!(access.current("tool").unwrap().restrictions.is_empty());
    }

    #[test]
    fn rebinding_a_source_does_not_grant_access_to_the_old_target() {
        let access = setup(true);
        access
            .db
            .0
            .lock()
            .unwrap()
            .execute("UPDATE attached_sources SET connection_id=99", [])
            .unwrap();
        assert!(access.current("tool").unwrap().restrictions.is_empty());
    }

    #[test]
    fn sidebar_scope_stays_bound_without_requiring_studio_attachments() {
        let access = setup(false);
        sources(&access, json!([]));
        let scope = access.current("tool").unwrap();
        assert!(scope.restrictions.contains_key("42"));
        assert!(!scope.restrictions.contains_key("99"));
    }

    #[test]
    fn confirmation_mode_and_rules_are_reloaded_for_queued_calls() {
        let access = setup(false);
        assert!(!access
            .current("tool")
            .unwrap()
            .confirmation_required(RiskLevel::Elevated)
            .unwrap());
        access
            .db
            .0
            .lock()
            .unwrap()
            .execute("UPDATE agent_sessions SET permissions_mode='Ask'", [])
            .unwrap();
        assert!(access
            .current("tool")
            .unwrap()
            .confirmation_required(RiskLevel::Elevated)
            .unwrap());
        access.db.0.lock().unwrap().execute("INSERT INTO confirmation_rules (id,session_id,tool_name,action,created_at) VALUES ('rule','chat','tool','allow_always',0)", []).unwrap();
        assert!(!access
            .current("tool")
            .unwrap()
            .confirmation_required(RiskLevel::Destructive)
            .unwrap());
        access
            .db
            .0
            .lock()
            .unwrap()
            .execute("UPDATE confirmation_rules SET action='deny_always'", [])
            .unwrap();
        assert!(access
            .current("tool")
            .unwrap()
            .confirmation_required(RiskLevel::Safe)
            .is_err());
    }

    #[test]
    fn malformed_confirmation_rules_fail_closed() {
        let access = setup(false);
        access.db.0.lock().unwrap().execute("INSERT INTO confirmation_rules (id,session_id,tool_name,action,created_at) VALUES ('rule','chat','tool','unknown',0)", []).unwrap();
        assert!(access.current("tool").is_err());
    }

    #[test]
    fn missing_or_malformed_session_state_fails_closed() {
        let access = setup(true);
        access
            .db
            .0
            .lock()
            .unwrap()
            .execute("UPDATE agent_sessions SET sources='invalid'", [])
            .unwrap();
        assert!(access.current("tool").is_err());
        access
            .db
            .0
            .lock()
            .unwrap()
            .execute("DELETE FROM agent_sessions", [])
            .unwrap();
        assert!(access.current("tool").is_err());
    }
}
