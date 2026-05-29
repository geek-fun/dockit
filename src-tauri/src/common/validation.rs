use url::form_urlencoded;

pub(crate) fn validate_index_name(name: &str, allow_wildcard: bool) -> Result<(), String> {
    if name.is_empty() {
        return Err("Index name must not be empty".to_string());
    }
    if name.len() > 255 {
        return Err("Index name exceeds 255 characters".to_string());
    }
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err(format!("Index name contains invalid characters: {}", name));
    }
    let valid = name.chars().all(|c| {
        c.is_ascii_lowercase()
            || c.is_ascii_digit()
            || c == '-'
            || c == '_'
            || c == '.'
            || (c == '*' && allow_wildcard)
    });
    if !valid {
        return Err(format!("Index name contains invalid characters: {}", name));
    }
    Ok(())
}

pub(crate) fn url_encode_segment(segment: &str) -> String {
    form_urlencoded::byte_serialize(segment.as_bytes()).collect()
}

/// Strip block comments (/* ... */) and line comments (-- ...) from SQL input.
fn strip_sql_comments(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '/' && chars.peek() == Some(&'*') {
            chars.next();
            while let Some(cc) = chars.next() {
                if cc == '*' && chars.peek() == Some(&'/') {
                    chars.next();
                    break;
                }
            }
        } else if c == '-' && chars.peek() == Some(&'-') {
            while let Some(cc) = chars.next() {
                if cc == '\n' {
                    break;
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

pub(crate) fn validate_dynamo_statement(tool_name: &str, statement: &str) -> Result<(), String> {
    let cleaned = strip_sql_comments(statement);
    let upper = cleaned.trim().to_uppercase();
    let first_word = upper.split_whitespace().next().unwrap_or("");

    match tool_name {
        "dynamo__execute_query" => {
            if matches!(
                first_word,
                "INSERT" | "UPDATE" | "DELETE" | "DROP" | "CREATE" | "ALTER" | "TRUNCATE"
            ) {
                return Err(format!(
                    "dynamo__execute_query is read-only; rejected statement starting with '{}'",
                    first_word
                ));
            }
        }
        "dynamo__execute_write" => {
            if matches!(first_word, "DELETE" | "DROP" | "TRUNCATE") {
                return Err(format!(
                    "dynamo__execute_write does not allow destructive statements starting with '{}'",
                    first_word
                ));
            }
        }
        "dynamo__execute_delete" => {
            if first_word != "DELETE" {
                return Err(format!(
                    "dynamo__execute_delete only allows DELETE statements, got '{}'",
                    first_word
                ));
            }
        }
        _ => {}
    }
    Ok(())
}
