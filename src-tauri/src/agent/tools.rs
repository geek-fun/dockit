use serde_json::{json, Value};

/// Return all agent-tagged capabilities as OpenAI-format tool definitions.
#[tauri::command]
pub fn get_all_tools() -> Result<String, String> {
    let reg = crate::capabilities::registry::registry();
    let caps = reg.agent_tools();

    let openai_tools: Vec<Value> = caps
        .iter()
        .map(|c| {
            json!({
                "type": "function",
                "function": {
                    "name": c.name,
                    "description": c.description,
                    "parameters": c.input_schema.clone()
                }
            })
        })
        .collect();

    let metadata: serde_json::Map<String, Value> = caps
        .iter()
        .map(|c| {
            (
                c.name.to_string(),
                json!({
                    "riskLevel": c.risk_level,
                    "requiredPermission": c.required_permission
                }),
            )
        })
        .collect();

    let result = json!({
        "tools": openai_tools,
        "metadata": metadata
    });

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

/// Return the required parameter names for a tool, as a human-readable string.
/// Used in parse-failure error messages to help the LLM self-correct.
pub fn get_tool_required_params(tool_name: &str) -> Option<String> {
    let reg = crate::capabilities::registry::registry();
    let cap = reg.get(tool_name)?;
    let params = cap.input_schema.get("properties")?.as_object()?;
    let required = cap
        .input_schema
        .get("required")?
        .as_array()?
        .iter()
        .filter_map(|r| r.as_str())
        .collect::<Vec<_>>();
    if required.is_empty() {
        return None;
    }
    let details: Vec<String> = required
        .iter()
        .map(|name| {
            let type_str = params
                .get(*name)
                .and_then(|p| p.get("type"))
                .and_then(|t| t.as_str())
                .unwrap_or("unknown");
            format!("{} ({})", name, type_str)
        })
        .collect();
    Some(details.join(", "))
}
