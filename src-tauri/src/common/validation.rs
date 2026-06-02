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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_index_name_valid() {
        assert!(validate_index_name("my-index", false).is_ok());
        assert!(validate_index_name("my_index", false).is_ok());
        assert!(validate_index_name("my.index", false).is_ok());
    }

    #[test]
    fn test_validate_index_name_empty() {
        assert!(validate_index_name("", false).unwrap_err().contains("empty"));
    }

    #[test]
    fn test_validate_index_name_too_long() {
        assert!(validate_index_name(&"a".repeat(256), false).unwrap_err().contains("255"));
    }

    #[test]
    fn test_validate_index_name_invalid_chars() {
        assert!(validate_index_name("INDEX", false).is_err());
        assert!(validate_index_name("has space", false).is_err());
        assert!(validate_index_name("has/slash", false).is_err());
        assert!(validate_index_name("has..dot", false).is_err());
    }

    #[test]
    fn test_validate_index_name_wildcard() {
        assert!(validate_index_name("logstash-*", false).is_err());
        assert!(validate_index_name("logstash-*", true).is_ok());
    }

    #[test]
    fn test_url_encode_segment_normal() {
        assert_eq!(url_encode_segment("hello"), "hello");
    }

    #[test]
    fn test_url_encode_segment_special() {
        assert_eq!(url_encode_segment("a/b"), "a%2Fb");
        assert_eq!(url_encode_segment("a b"), "a+b");
    }

    #[test]
    fn test_url_encode_segment_empty() {
        assert_eq!(url_encode_segment(""), "");
    }

    #[test]
    fn test_strip_sql_comments_none() {
        assert_eq!(strip_sql_comments("SELECT * FROM t"), "SELECT * FROM t");
    }

    #[test]
    fn test_strip_sql_comments_block() {
        assert_eq!(strip_sql_comments("/* t */ SELECT * FROM t").trim(), "SELECT * FROM t");
    }

    #[test]
    fn test_strip_sql_comments_line() {
        assert_eq!(strip_sql_comments("-- f\nSELECT * FROM t").trim(), "SELECT * FROM t");
    }

    #[test]
    fn test_strip_sql_comments_mixed() {
        let r = strip_sql_comments("/* b */ SELECT *\n-- l\nFROM t");
        assert!(r.contains("SELECT") && r.contains("FROM t") && !r.contains("/*") && !r.contains("--"));
    }

    #[test]
    fn test_validate_dynamo_query_accepts_select() {
        assert!(validate_dynamo_statement("dynamo__execute_query", "SELECT * FROM t").is_ok());
    }

    #[test]
    fn test_validate_dynamo_query_rejects_write() {
        let e = validate_dynamo_statement("dynamo__execute_query", "INSERT INTO t VALUE {'a':'b'}").unwrap_err();
        assert!(e.contains("read-only"), "got: {}", e);
    }

    #[test]
    fn test_validate_dynamo_write_accepts_insert() {
        assert!(validate_dynamo_statement("dynamo__execute_write", "INSERT INTO t VALUE {'a':'b'}").is_ok());
    }

    #[test]
    fn test_validate_dynamo_write_rejects_delete() {
        let e = validate_dynamo_statement("dynamo__execute_write", "DELETE FROM t WHERE pk='x'").unwrap_err();
        assert!(e.contains("destructive"), "got: {}", e);
    }

    #[test]
    fn test_validate_dynamo_delete_accepts_delete() {
        assert!(validate_dynamo_statement("dynamo__execute_delete", "DELETE FROM t WHERE pk='x'").is_ok());
    }

    #[test]
    fn test_validate_dynamo_delete_rejects_select() {
        let e = validate_dynamo_statement("dynamo__execute_delete", "SELECT * FROM t").unwrap_err();
        assert!(e.contains("only allows DELETE"), "got: {}", e);
    }

    #[test]
    fn test_validate_dynamo_with_comments_stripped() {
        assert!(validate_dynamo_statement("dynamo__execute_query", "/* r */ SELECT * FROM t").is_ok());
        assert!(validate_dynamo_statement("dynamo__execute_query", "-- r\nSELECT * FROM t").is_ok());
        assert!(validate_dynamo_statement("dynamo__execute_query", "/* clean */ DELETE FROM t").is_err());
    }
}
