use super::chain::Permission;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AccessDenial {
    pub kind: String,
    pub source: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<Permission>,
}

impl AccessDenial {
    pub fn permission(action: Permission, id: &str, source: &str) -> Self {
        let source_label = match source {
            "system" => "DocKit system AI defaults",
            "connection" => "this connection's AI permissions",
            "conversation" => "this conversation's source restrictions",
            _ => "DocKit AI permissions",
        };
        Self {
            kind: "permission".into(),
            source: source.into(),
            message: format!("{action:?} access denied for connection '{id}' by {source_label}"),
            connection_id: Some(id.into()),
            source_id: None,
            action: Some(action),
        }
    }

    pub fn rule() -> Self {
        Self::other("rule", "rule", "Tool call denied by conversation rule")
    }

    pub fn other(kind: &str, source: &str, message: &str) -> Self {
        Self {
            kind: kind.into(),
            source: source.into(),
            message: message.into(),
            connection_id: None,
            source_id: None,
            action: None,
        }
    }

    pub fn encode(&self) -> String {
        serde_json::json!({"aiAccessDenial": self}).to_string()
    }

    pub fn decode(message: &str) -> Option<Self> {
        let value: Value = serde_json::from_str(message).ok()?;
        serde_json::from_value(value.get("aiAccessDenial")?.clone()).ok()
    }

    pub fn from_message(message: &str) -> Self {
        Self::decode(message).unwrap_or_else(|| {
            let user = message == "Tool call was not approved"
                || (message.starts_with("Tool call '")
                    && message.contains("was denied by the user."));
            Self::other(if user { "user" } else { "permission" }, "unknown", message)
        })
    }

    pub fn from_error(message: &str) -> Self {
        Self::decode(message).unwrap_or_else(|| Self::other("unavailable", "unknown", message))
    }

    pub fn with_context(mut self, config: &Value) -> Self {
        self.connection_id = self
            .connection_id
            .or_else(|| config["connectionId"].as_str().map(str::to_owned));
        self.source_id = config["sourceId"].as_str().map(str::to_owned);
        self
    }
}

pub(crate) fn display_denial(message: &str) -> String {
    AccessDenial::decode(message).map_or_else(|| message.to_owned(), |denial| denial.message)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn denial_context_survives_runtime_strings_without_exposing_json_to_mcp() {
        let denial = AccessDenial::permission(Permission::Manage, "db", "system")
            .with_context(&serde_json::json!({"connectionId":"db","sourceId":"source"}));
        let encoded = denial.encode();
        assert_eq!(AccessDenial::decode(&encoded), Some(denial.clone()));
        assert_eq!(display_denial(&encoded), denial.message);
        assert_eq!(denial.source_id.as_deref(), Some("source"));
        assert!(AccessDenial::decode("ordinary database error").is_none());
        assert_eq!(
            AccessDenial::from_error("Invalid SQL statement").kind,
            "unavailable"
        );
    }
}
