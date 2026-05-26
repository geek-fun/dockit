use futures::TryStreamExt;
use mongodb::bson::{doc, oid::ObjectId, Bson, Document};
use mongodb::{options::ClientOptions, Client};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::form_urlencoded;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum MongoAuth {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "scram")]
    Scram {
        username: String,
        password: String,
        #[serde(rename = "authSource")]
        auth_source: Option<String>,
        #[serde(rename = "authMechanism")]
        auth_mechanism: Option<String>,
    },
    #[serde(rename = "uri")]
    Uri { uri: String },
}

#[derive(Debug, Deserialize)]
pub struct MongoConnectionConfig {
    pub host: String,
    pub port: u16,
    pub auth: MongoAuth,
    pub database: Option<String>,
    pub tls: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct MongoTestResult {
    pub success: bool,
    pub message: String,
    pub collections: Option<Vec<String>>,
}

fn encode_component(s: &str) -> String {
    form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

fn build_uri(config: &MongoConnectionConfig) -> String {
    match &config.auth {
        MongoAuth::Uri { uri } => uri.clone(),
        _ => {
            let use_tls = config.tls.unwrap_or(false);
            let host = if config.host.is_empty() {
                "localhost".to_string()
            } else {
                config.host.clone()
            };

            let db_path = config
                .database
                .as_deref()
                .map(|d| format!("/{}", d))
                .unwrap_or_default();

            let mut params: Vec<String> = Vec::new();
            if use_tls {
                params.push("tls=true".to_string());
            }

            match &config.auth {
                MongoAuth::Scram {
                    username,
                    password,
                    auth_source,
                    auth_mechanism,
                } => {
                    let encoded_user = encode_component(username);
                    let encoded_pass = encode_component(password);
                    let source = auth_source.as_deref().unwrap_or("admin");
                    params.push(format!("authSource={}", source));
                    if let Some(mechanism) = auth_mechanism {
                        params.push(format!("authMechanism={}", mechanism));
                    }
                    let query = if params.is_empty() {
                        String::new()
                    } else {
                        format!("?{}", params.join("&"))
                    };
                    format!(
                        "mongodb://{}:{}@{}:{}{}{}",
                        encoded_user, encoded_pass, host, config.port, db_path, query
                    )
                }
                _ => {
                    let query = if params.is_empty() {
                        String::new()
                    } else {
                        format!("?{}", params.join("&"))
                    };
                    format!("mongodb://{}:{}{}{}", host, config.port, db_path, query)
                }
            }
        }
    }
}

#[tauri::command]
pub async fn mongo_test_connection(
    config: MongoConnectionConfig,
) -> Result<MongoTestResult, String> {
    let uri = build_uri(&config);

    let client_options = match ClientOptions::parse(&uri).await {
        Ok(opts) => opts,
        Err(e) => {
            return Ok(MongoTestResult {
                success: false,
                message: format!("Failed to parse connection options: {}", e),
                collections: None,
            });
        }
    };

    let client = match Client::with_options(client_options) {
        Ok(c) => c,
        Err(e) => {
            return Ok(MongoTestResult {
                success: false,
                message: format!("Failed to create client: {}", e),
                collections: None,
            });
        }
    };

    let db = client.database("admin");
    if let Err(e) = db.run_command(mongodb::bson::doc! { "ping": 1 }).await {
        return Ok(MongoTestResult {
            success: false,
            message: format!("Connection failed: {}", e),
            collections: None,
        });
    }

    let collections = if let Some(db_name) = &config.database {
        let target_db = client.database(db_name);
        match target_db.list_collection_names().await {
            Ok(names) => names,
            Err(e) => {
                return Ok(MongoTestResult {
                    success: false,
                    message: format!("Failed to list collections: {}", e),
                    collections: None,
                });
            }
        }
    } else {
        Vec::new()
    };

    Ok(MongoTestResult {
        success: true,
        message: "Connection successful".to_string(),
        collections: Some(collections),
    })
}

#[derive(Debug, Serialize)]
pub struct MongoQueryResult {
    pub success: bool,
    pub data: Option<Value>,
    pub error: Option<String>,
}

fn bson_to_json(bson: &Bson) -> Value {
    match bson {
        Bson::Double(v) => Value::from(*v),
        Bson::String(v) => Value::from(v.as_str()),
        Bson::Array(arr) => Value::Array(arr.iter().map(bson_to_json).collect()),
        Bson::Document(d) => {
            let map: serde_json::Map<String, Value> = d
                .iter()
                .map(|(k, v)| (k.clone(), bson_to_json(v)))
                .collect();
            Value::Object(map)
        }
        Bson::Boolean(v) => Value::from(*v),
        Bson::Null => Value::Null,
        Bson::Int32(v) => Value::from(*v),
        Bson::Int64(v) => Value::from(*v),
        Bson::ObjectId(oid) => Value::from(oid.to_string()),
        Bson::DateTime(dt) => Value::from(dt.to_string()),
        Bson::Decimal128(d) => Value::from(d.to_string()),
        _ => Value::from(bson.to_string()),
    }
}

fn doc_get_i64(doc: &Document, key: &str) -> i64 {
    match doc.get(key) {
        Some(Bson::Int64(v)) => *v,
        Some(Bson::Int32(v)) => *v as i64,
        Some(Bson::Double(v)) => *v as i64,
        _ => 0,
    }
}

fn doc_get_i64_opt(doc: &Document, key: &str) -> Option<i64> {
    match doc.get(key) {
        Some(Bson::Int64(v)) => Some(*v),
        Some(Bson::Int32(v)) => Some(*v as i64),
        Some(Bson::Double(v)) => Some(*v as i64),
        _ => None,
    }
}

fn doc_to_json(d: Document) -> Value {
    let map: serde_json::Map<String, Value> =
        d.into_iter().map(|(k, v)| (k, bson_to_json(&v))).collect();
    Value::Object(map)
}

fn json_to_bson_doc(val: Value) -> Result<Document, String> {
    mongodb::bson::to_document(&val)
        .map_err(|e| format!("Failed to convert to BSON document: {}", e))
}

// Convert JS-style object literals (single quotes, unquoted keys, ObjectId(), new Date()) to valid JSON.
fn js_to_json(s: &str) -> String {
    let s = s.trim();
    let mut out = String::with_capacity(s.len() + 32);
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut in_string = false;
    let mut string_char = '"';

    while i < len {
        let ch = chars[i];

        if in_string {
            if ch == '\\' && i + 1 < len {
                out.push(ch);
                out.push(chars[i + 1]);
                i += 2;
                continue;
            }
            if ch == string_char {
                in_string = false;
                out.push('"');
                i += 1;
                continue;
            }
            if ch == '"' && string_char == '\'' {
                out.push('\\');
                out.push('"');
                i += 1;
                continue;
            }
            out.push(ch);
            i += 1;
            continue;
        }

        // Skip line comments
        if ch == '/' && i + 1 < len && chars[i + 1] == '/' {
            while i < len && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }

        if ch == '"' || ch == '\'' {
            in_string = true;
            string_char = ch;
            out.push('"');
            i += 1;
            continue;
        }

        // Quote unquoted object keys
        if (ch.is_alphabetic() || ch == '_' || ch == '$') && !in_string {
            let start = i;
            while i < len && (chars[i].is_alphanumeric() || chars[i] == '_' || chars[i] == '$') {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect();
            let mut j = i;
            while j < len && chars[j] == ' ' {
                j += 1;
            }
            if j < len && chars[j] == ':' {
                out.push('"');
                out.push_str(&word);
                out.push('"');
            } else {
                match word.as_str() {
                    "true" | "false" | "null" => out.push_str(&word),
                    "undefined" => out.push_str("null"),
                    // Skip the `new` keyword and let the next word (e.g. `Date`) be processed normally
                    "new" => {}
                    _ => {
                        if j < len && chars[j] == '(' {
                            let mut depth = 0i32;
                            let mut k = j;
                            while k < len {
                                match chars[k] {
                                    '(' => depth += 1,
                                    ')' => {
                                        depth -= 1;
                                        if depth == 0 {
                                            k += 1;
                                            break;
                                        }
                                    }
                                    _ => {}
                                }
                                k += 1;
                            }
                            let inner: String = chars[j + 1..k.saturating_sub(1)].iter().collect();
                            let inner = inner.trim().trim_matches('"').trim_matches('\'');
                            // Emit Extended JSON for known BSON types so the driver decodes them correctly
                            match word.as_str() {
                                "ObjectId" => {
                                    out.push_str("{\"$oid\":\"");
                                    out.push_str(inner);
                                    out.push_str("\"}");
                                }
                                "ISODate" | "Date" => {
                                    out.push_str("{\"$date\":\"");
                                    out.push_str(inner);
                                    out.push_str("\"}");
                                }
                                "NumberLong" | "Long" => {
                                    out.push_str("{\"$numberLong\":\"");
                                    out.push_str(inner);
                                    out.push_str("\"}");
                                }
                                "NumberDecimal" | "Decimal128" => {
                                    out.push_str("{\"$numberDecimal\":\"");
                                    out.push_str(inner);
                                    out.push_str("\"}");
                                }
                                _ => {
                                    if inner.is_empty() {
                                        out.push_str("null");
                                    } else {
                                        out.push('"');
                                        out.push_str(inner);
                                        out.push('"');
                                    }
                                }
                            }
                            i = k;
                        } else {
                            out.push_str(&word);
                        }
                    }
                }
            }
            continue;
        }

        out.push(ch);
        i += 1;
    }

    out
}

fn parse_json_arg(s: &str) -> Result<Value, String> {
    let s = s.trim();
    if s.is_empty() {
        return Ok(Value::Object(serde_json::Map::new()));
    }
    serde_json::from_str(s)
        .or_else(|_| serde_json::from_str(&js_to_json(s)))
        .map_err(|e| {
            format!(
                "Failed to parse argument '{}': {}",
                &s[..s.len().min(80)],
                e
            )
        })
}

fn split_top_level_args(s: &str) -> Vec<String> {
    let s = s.trim();
    if s.is_empty() {
        return vec![];
    }
    let mut args: Vec<String> = vec![];
    let mut depth = 0i32;
    let mut start = 0usize;
    let mut in_string = false;
    let mut string_char = '"';
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if in_string {
            if ch == '\\' {
                i += 2;
                continue;
            }
            if ch == string_char {
                in_string = false;
            }
            i += 1;
            continue;
        }
        match ch {
            '"' | '\'' => {
                in_string = true;
                string_char = ch;
            }
            '{' | '[' | '(' => depth += 1,
            '}' | ']' | ')' => depth -= 1,
            ',' if depth == 0 => {
                let raw: String = chars[start..i].iter().collect();
                args.push(raw.trim().to_string());
                start = i + 1;
            }
            _ => {}
        }
        i += 1;
    }
    let last: String = chars[start..].iter().collect();
    let last = last.trim().to_string();
    if !last.is_empty() {
        args.push(last);
    }
    args
}

// Given a string starting with '(', extract the inner content and return (inner, rest_after_close_paren).
fn extract_balanced(s: &str) -> Result<(String, &str), String> {
    let chars: Vec<char> = s.chars().collect();
    if chars.is_empty() || chars[0] != '(' {
        return Err(format!("Expected '(' but got: {}", &s[..s.len().min(20)]));
    }
    let mut depth = 0i32;
    let mut in_string = false;
    let mut string_char = '"';
    let mut i = 0;
    let mut byte_pos = 0usize;

    for ch in &chars {
        if in_string {
            if *ch == '\\' {
                i += 1;
                byte_pos += ch.len_utf8();
                continue;
            }
            if *ch == string_char {
                in_string = false;
            }
            i += 1;
            byte_pos += ch.len_utf8();
            continue;
        }
        match ch {
            '"' | '\'' => {
                in_string = true;
                string_char = *ch;
            }
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    let inner: String = chars[1..i].iter().collect();
                    byte_pos += ch.len_utf8();
                    return Ok((inner, &s[byte_pos..]));
                }
            }
            _ => {}
        }
        i += 1;
        byte_pos += ch.len_utf8();
    }
    Err("Unmatched '(' in statement".to_string())
}

fn parse_chain(s: &str) -> Result<(Option<i64>, Option<u64>, Option<Document>), String> {
    let mut limit: Option<i64> = None;
    let mut skip: Option<u64> = None;
    let mut sort_doc: Option<Document> = None;
    let mut s = s.trim();

    while s.starts_with('.') {
        s = &s[1..];
        let paren_pos = match s.find('(') {
            Some(p) => p,
            None => break,
        };
        let method = s[..paren_pos].trim();
        let (arg_str, rest) = extract_balanced(&s[paren_pos..])?;
        match method {
            "limit" => {
                limit = arg_str.trim().parse::<i64>().ok();
            }
            "skip" => {
                skip = arg_str.trim().parse::<u64>().ok();
            }
            "sort" => {
                if let Ok(val) = parse_json_arg(&arg_str) {
                    sort_doc = json_to_bson_doc(val).ok();
                }
            }
            _ => {}
        }
        s = rest.trim();
    }

    Ok((limit, skip, sort_doc))
}

struct ParsedStatement {
    collection: String,
    method: String,
    args: Vec<String>,
    chain_limit: Option<i64>,
    chain_skip: Option<u64>,
    chain_sort: Option<Document>,
}

fn parse_statement(code: &str) -> Result<ParsedStatement, String> {
    let code = code.trim().trim_end_matches(';').trim();

    if !code.starts_with("db") {
        return Err(format!(
            "Statement must start with 'db': {}",
            &code[..code.len().min(60)]
        ));
    }

    let after_db = &code[2..];

    let (collection, rest) = if after_db.starts_with('[') {
        let end = after_db
            .find(']')
            .ok_or("Unmatched '[' in collection accessor")?;
        let name = after_db[1..end]
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();
        (name, &after_db[end + 1..])
    } else if after_db.starts_with(".getCollection(") {
        let start = ".getCollection(".len();
        let end = after_db[start..]
            .find(')')
            .map(|i| i + start)
            .ok_or("Unmatched '(' in getCollection")?;
        let name = after_db[start..end]
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .to_string();
        (name, &after_db[end + 1..])
    } else if after_db.starts_with('.') {
        let rest = &after_db[1..];
        let dot_pos = rest
            .find('.')
            .ok_or(format!("Missing method on collection: {}", code))?;
        (rest[..dot_pos].to_string(), &rest[dot_pos..])
    } else {
        return Err(format!(
            "Cannot parse collection from: {}",
            &code[..code.len().min(60)]
        ));
    };

    if !rest.starts_with('.') {
        return Err(format!(
            "Expected '.' before method name, got: {}",
            &rest[..rest.len().min(20)]
        ));
    }
    let rest = &rest[1..];

    let paren_pos = rest.find('(').ok_or(format!(
        "Missing '(' for method call: {}",
        &rest[..rest.len().min(30)]
    ))?;
    let method = rest[..paren_pos].trim().to_string();

    let (main_args_str, chain_str) = extract_balanced(&rest[paren_pos..])?;
    let args = split_top_level_args(&main_args_str);
    let (chain_limit, chain_skip, chain_sort) = parse_chain(chain_str)?;

    Ok(ParsedStatement {
        collection,
        method,
        args,
        chain_limit,
        chain_skip,
        chain_sort,
    })
}

fn split_statements(code: &str) -> Vec<String> {
    let mut statements: Vec<String> = vec![];
    let mut depth = 0i32;
    let mut in_string = false;
    let mut string_char = '"';
    let mut stmt_start: Option<usize> = None;
    let chars: Vec<char> = code.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];
        if in_string {
            if ch == '\\' {
                i += 2;
                continue;
            }
            if ch == string_char {
                in_string = false;
            }
            i += 1;
            continue;
        }
        match ch {
            '"' | '\'' | '`' => {
                in_string = true;
                string_char = ch;
                if stmt_start.is_none() {
                    stmt_start = Some(i);
                }
            }
            '{' | '[' | '(' => {
                depth += 1;
                if stmt_start.is_none() {
                    stmt_start = Some(i);
                }
            }
            '}' | ']' | ')' => {
                if depth > 0 {
                    depth -= 1;
                }
            }
            '\n' | ';' if depth == 0 => {
                if let Some(start) = stmt_start {
                    let stmt: String = chars[start..i].iter().collect();
                    let stmt = stmt.trim().to_string();
                    if stmt.starts_with("db") {
                        statements.push(stmt);
                    }
                    stmt_start = None;
                }
            }
            ' ' | '\t' | '\r' if stmt_start.is_none() => {}
            _ => {
                if stmt_start.is_none() {
                    stmt_start = Some(i);
                }
            }
        }
        i += 1;
    }

    if let Some(start) = stmt_start {
        let stmt: String = chars[start..].iter().collect();
        let stmt = stmt.trim().trim_end_matches(';').trim().to_string();
        if stmt.starts_with("db") {
            statements.push(stmt);
        }
    }

    if statements.is_empty() {
        let single = code.trim().trim_end_matches(';').trim().to_string();
        if !single.is_empty() {
            statements.push(single);
        }
    }

    statements
}

async fn execute_statement(
    client: &Client,
    db_name: &str,
    stmt: ParsedStatement,
) -> Result<Value, String> {
    let db = client.database(db_name);
    let coll = db.collection::<Document>(&stmt.collection);

    match stmt.method.as_str() {
        "find" => {
            let filter = if stmt.args.is_empty() || stmt.args[0].is_empty() {
                doc! {}
            } else {
                parse_json_arg(&stmt.args[0]).and_then(json_to_bson_doc)?
            };
            let mut opts = mongodb::options::FindOptions::default();
            if let Some(proj_raw) = stmt.args.get(1) {
                if !proj_raw.is_empty() {
                    if let Ok(proj) = parse_json_arg(proj_raw).and_then(json_to_bson_doc) {
                        opts.projection = Some(proj);
                    }
                }
            }
            opts.limit = Some(stmt.chain_limit.unwrap_or(100).min(1000));
            opts.skip = stmt.chain_skip;
            opts.sort = stmt.chain_sort;
            let mut cursor = coll.find(filter).with_options(opts).await.map_err(|e| e.to_string())?;
            let mut docs: Vec<Value> = vec![];
            while let Some(d) = cursor.try_next().await.map_err(|e| e.to_string())? {
                docs.push(doc_to_json(d));
            }
            Ok(Value::Array(docs))
        }
        "findOne" => {
            let filter = if stmt.args.is_empty() || stmt.args[0].is_empty() {
                doc! {}
            } else {
                parse_json_arg(&stmt.args[0]).and_then(json_to_bson_doc)?
            };
            let result = coll.find_one(filter).await.map_err(|e| e.to_string())?;
            Ok(result.map(doc_to_json).unwrap_or(Value::Null))
        }
        "countDocuments" => {
            let filter = if stmt.args.is_empty() || stmt.args[0].is_empty() {
                doc! {}
            } else {
                parse_json_arg(&stmt.args[0]).and_then(json_to_bson_doc)?
            };
            let count = coll.count_documents(filter).await.map_err(|e| e.to_string())?;
            Ok(Value::from(count))
        }
        "estimatedDocumentCount" => {
            let count = coll.estimated_document_count().await.map_err(|e| e.to_string())?;
            Ok(Value::from(count))
        }
        "insertOne" => {
            let doc_raw = stmt.args.first().ok_or("insertOne requires a document argument")?;
            let d = parse_json_arg(doc_raw).and_then(json_to_bson_doc)?;
            let result = coll.insert_one(d).await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "acknowledged": true, "insertedId": result.inserted_id.to_string() }))
        }
        "insertMany" => {
            let docs_raw = stmt.args.first().ok_or("insertMany requires a documents array")?;
            let docs_val = parse_json_arg(docs_raw)?;
            let docs_arr = docs_val.as_array().ok_or("insertMany argument must be an array")?;
            let docs: Vec<Document> = docs_arr.iter().map(|v| json_to_bson_doc(v.clone())).collect::<Result<Vec<_>, _>>()?;
            let result = coll.insert_many(docs).await.map_err(|e| e.to_string())?;
            let ids: Vec<Value> = result.inserted_ids.values().map(|id| Value::from(id.to_string())).collect();
            Ok(serde_json::json!({ "acknowledged": true, "insertedCount": ids.len(), "insertedIds": ids }))
        }
        "updateOne" => {
            let filter = parse_json_arg(stmt.args.first().ok_or("updateOne requires filter")?).and_then(json_to_bson_doc)?;
            let update = parse_json_arg(stmt.args.get(1).ok_or("updateOne requires update document")?).and_then(json_to_bson_doc)?;
            let result = coll.update_one(filter, update).await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "acknowledged": true, "matchedCount": result.matched_count, "modifiedCount": result.modified_count, "upsertedId": result.upserted_id.map(|id| id.to_string()) }))
        }
        "updateMany" => {
            let filter = parse_json_arg(stmt.args.first().ok_or("updateMany requires filter")?).and_then(json_to_bson_doc)?;
            let update = parse_json_arg(stmt.args.get(1).ok_or("updateMany requires update document")?).and_then(json_to_bson_doc)?;
            let result = coll.update_many(filter, update).await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "acknowledged": true, "matchedCount": result.matched_count, "modifiedCount": result.modified_count }))
        }
        "replaceOne" => {
            let filter = parse_json_arg(stmt.args.first().ok_or("replaceOne requires filter")?).and_then(json_to_bson_doc)?;
            let replacement = parse_json_arg(stmt.args.get(1).ok_or("replaceOne requires replacement")?).and_then(json_to_bson_doc)?;
            let result = coll.replace_one(filter, replacement).await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "acknowledged": true, "matchedCount": result.matched_count, "modifiedCount": result.modified_count, "upsertedId": result.upserted_id.map(|id| id.to_string()) }))
        }
        "deleteOne" => {
            let filter = parse_json_arg(stmt.args.first().ok_or("deleteOne requires a filter")?).and_then(json_to_bson_doc)?;
            let result = coll.delete_one(filter).await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "acknowledged": true, "deletedCount": result.deleted_count }))
        }
        "deleteMany" => {
            let filter = parse_json_arg(stmt.args.first().ok_or("deleteMany requires a filter")?).and_then(json_to_bson_doc)?;
            let result = coll.delete_many(filter).await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "acknowledged": true, "deletedCount": result.deleted_count }))
        }
        "aggregate" => {
            let pipeline_raw = stmt.args.first().ok_or("aggregate requires a pipeline array")?;
            let pipeline_val = parse_json_arg(pipeline_raw)?;
            let stages = pipeline_val.as_array().ok_or("aggregate pipeline must be an array")?;
            let pipeline: Vec<Document> = stages.iter().map(|v| json_to_bson_doc(v.clone())).collect::<Result<Vec<_>, _>>()?;
            let mut cursor = coll.aggregate(pipeline).await.map_err(|e| e.to_string())?;
            let mut docs: Vec<Value> = vec![];
            while let Some(d) = cursor.try_next().await.map_err(|e| e.to_string())? {
                docs.push(doc_to_json(d));
            }
            Ok(Value::Array(docs))
        }
        "distinct" => {
            let field = stmt.args.first().ok_or("distinct requires a field name")?
                .trim().trim_matches('"').trim_matches('\'').to_string();
            let filter = stmt.args.get(1)
                .and_then(|r| parse_json_arg(r).and_then(json_to_bson_doc).ok())
                .unwrap_or(doc! {});
            let result = coll.distinct(&field, filter).await.map_err(|e| e.to_string())?;
            Ok(Value::Array(result.iter().map(bson_to_json).collect()))
        }
        "createIndex" => {
            use mongodb::IndexModel;
            let keys = parse_json_arg(stmt.args.first().ok_or("createIndex requires keys document")?).and_then(json_to_bson_doc)?;
            let index = IndexModel::builder().keys(keys).build();
            let result = coll.create_index(index).await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "ok": 1, "name": result.index_name }))
        }
        "dropIndex" => {
            let name = stmt.args.first().ok_or("dropIndex requires an index name")?
                .trim().trim_matches('"').trim_matches('\'').to_string();
            coll.drop_index(&name).await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "ok": 1 }))
        }
        "drop" => {
            coll.drop().await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({ "ok": 1 }))
        }
        "bulkWrite" => {
            use mongodb::options::{
                DeleteManyModel, DeleteOneModel, InsertOneModel, ReplaceOneModel,
                UpdateManyModel, UpdateOneModel, WriteModel,
            };
            use mongodb::Namespace;

            let ops_raw = stmt.args.first().ok_or("bulkWrite requires an operations array")?;
            let ops_val = parse_json_arg(ops_raw)?;
            let ops_arr = ops_val.as_array().ok_or("bulkWrite argument must be an array")?;
            let ns = Namespace::new(db_name, &stmt.collection);

            let mut models: Vec<WriteModel> = Vec::with_capacity(ops_arr.len());
            for op in ops_arr {
                let obj = op.as_object().ok_or("each bulkWrite operation must be an object")?;
                if let Some(args) = obj.get("insertOne") {
                    let doc = json_to_bson_doc(args.get("document").ok_or("insertOne requires 'document'")?.clone())?;
                    models.push(WriteModel::InsertOne(
                        InsertOneModel::builder().namespace(ns.clone()).document(doc).build(),
                    ));
                } else if let Some(args) = obj.get("updateOne") {
                    let filter = json_to_bson_doc(args.get("filter").ok_or("updateOne requires 'filter'")?.clone())?;
                    let update_doc = json_to_bson_doc(args.get("update").ok_or("updateOne requires 'update'")?.clone())?;
                    let update = mongodb::options::UpdateModifications::Document(update_doc);
                    let upsert = args.get("upsert").and_then(|v| v.as_bool());
                    let model = match upsert {
                        Some(u) => UpdateOneModel::builder().namespace(ns.clone()).filter(filter).update(update).upsert(u).build(),
                        None => UpdateOneModel::builder().namespace(ns.clone()).filter(filter).update(update).build(),
                    };
                    models.push(WriteModel::UpdateOne(model));
                } else if let Some(args) = obj.get("updateMany") {
                    let filter = json_to_bson_doc(args.get("filter").ok_or("updateMany requires 'filter'")?.clone())?;
                    let update_doc = json_to_bson_doc(args.get("update").ok_or("updateMany requires 'update'")?.clone())?;
                    let update = mongodb::options::UpdateModifications::Document(update_doc);
                    let upsert = args.get("upsert").and_then(|v| v.as_bool());
                    let model = match upsert {
                        Some(u) => UpdateManyModel::builder().namespace(ns.clone()).filter(filter).update(update).upsert(u).build(),
                        None => UpdateManyModel::builder().namespace(ns.clone()).filter(filter).update(update).build(),
                    };
                    models.push(WriteModel::UpdateMany(model));
                } else if let Some(args) = obj.get("replaceOne") {
                    let filter = json_to_bson_doc(args.get("filter").ok_or("replaceOne requires 'filter'")?.clone())?;
                    let replacement = json_to_bson_doc(args.get("replacement").ok_or("replaceOne requires 'replacement'")?.clone())?;
                    let upsert = args.get("upsert").and_then(|v| v.as_bool());
                    let model = match upsert {
                        Some(u) => ReplaceOneModel::builder().namespace(ns.clone()).filter(filter).replacement(replacement).upsert(u).build(),
                        None => ReplaceOneModel::builder().namespace(ns.clone()).filter(filter).replacement(replacement).build(),
                    };
                    models.push(WriteModel::ReplaceOne(model));
                } else if let Some(args) = obj.get("deleteOne") {
                    let filter = json_to_bson_doc(args.get("filter").ok_or("deleteOne requires 'filter'")?.clone())?;
                    models.push(WriteModel::DeleteOne(
                        DeleteOneModel::builder().namespace(ns.clone()).filter(filter).build(),
                    ));
                } else if let Some(args) = obj.get("deleteMany") {
                    let filter = json_to_bson_doc(args.get("filter").ok_or("deleteMany requires 'filter'")?.clone())?;
                    models.push(WriteModel::DeleteMany(
                        DeleteManyModel::builder().namespace(ns.clone()).filter(filter).build(),
                    ));
                } else {
                    return Err(format!("Unknown bulkWrite operation: {:?}", obj.keys().collect::<Vec<_>>()));
                }
            }

            let result = client.bulk_write(models).await.map_err(|e| e.to_string())?;
            Ok(serde_json::json!({
                "acknowledged": true,
                "insertedCount": result.inserted_count,
                "matchedCount": result.matched_count,
                "modifiedCount": result.modified_count,
                "deletedCount": result.deleted_count,
                "upsertedCount": result.upserted_count,
            }))
        }
        other => Err(format!(
            "Unsupported method '{}'. Supported: find, findOne, countDocuments, estimatedDocumentCount, insertOne, insertMany, updateOne, updateMany, replaceOne, deleteOne, deleteMany, aggregate, distinct, createIndex, dropIndex, drop, bulkWrite",
            other
        )),
    }
}

#[tauri::command]
pub async fn mongo_execute_query(
    config: MongoConnectionConfig,
    code: String,
) -> Result<MongoQueryResult, String> {
    let db_name = config
        .database
        .clone()
        .unwrap_or_else(|| "test".to_string());

    let client = match build_client(&config).await {
        Ok(c) => c,
        Err(e) => {
            return Ok(MongoQueryResult {
                success: false,
                data: None,
                error: Some(e),
            })
        }
    };

    let statements = split_statements(&code);
    if statements.is_empty() {
        return Ok(MongoQueryResult {
            success: false,
            data: None,
            error: Some("No valid statements found".to_string()),
        });
    }

    let mut last_result: Value = Value::Null;
    for stmt_str in statements {
        let stmt = match parse_statement(&stmt_str) {
            Ok(p) => p,
            Err(e) => {
                return Ok(MongoQueryResult {
                    success: false,
                    data: None,
                    error: Some(e),
                })
            }
        };
        match execute_statement(&client, &db_name, stmt).await {
            Ok(result) => last_result = result,
            Err(e) => {
                return Ok(MongoQueryResult {
                    success: false,
                    data: None,
                    error: Some(e),
                })
            }
        }
    }

    Ok(MongoQueryResult {
        success: true,
        data: Some(last_result),
        error: None,
    })
}

async fn build_client(config: &MongoConnectionConfig) -> Result<Client, String> {
    let uri = build_uri(config);
    let client_options = ClientOptions::parse(&uri)
        .await
        .map_err(|e| format!("Failed to parse connection options: {}", e))?;
    Client::with_options(client_options).map_err(|e| format!("Failed to create client: {}", e))
}

// ==================== MongoDB Management Commands ====================

/// Database info returned by mongo_list_databases
#[derive(Debug, Serialize)]
pub struct MongoDatabaseInfo {
    pub name: String,
    pub size_on_disk: Option<i64>,
    pub empty: Option<bool>,
    pub collections: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MongoListDatabasesResult {
    pub success: bool,
    pub databases: Option<Vec<MongoDatabaseInfo>>,
    pub total_size: Option<i64>,
    pub error: Option<String>,
}

/// Collection info returned by mongo_list_collections
#[derive(Debug, Serialize)]
pub struct MongoCollectionInfo {
    pub name: String,
    pub collection_type: String,
    pub document_count: Option<i64>,
    pub storage_size: Option<i64>,
    pub index_count: Option<i64>,
    pub avg_document_size: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MongoListCollectionsResult {
    pub success: bool,
    pub collections: Option<Vec<MongoCollectionInfo>>,
    pub error: Option<String>,
}

/// Detailed collection stats
#[derive(Debug, Serialize)]
pub struct MongoCollectionStats {
    pub ns: String,
    pub count: i64,
    pub size: i64,
    pub avg_obj_size: Option<i64>,
    pub storage_size: i64,
    pub nindexes: i64,
    pub total_index_size: i64,
    pub index_sizes: Option<serde_json::Map<String, Value>>,
    pub capped: Option<bool>,
    pub max: Option<i64>,
    pub max_size: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MongoCollectionStatsResult {
    pub success: bool,
    pub stats: Option<MongoCollectionStats>,
    pub error: Option<String>,
}

/// Database stats
#[derive(Debug, Serialize)]
pub struct MongoDatabaseStats {
    pub db: String,
    pub collections: i64,
    pub objects: i64,
    pub avg_obj_size: Option<i64>,
    pub data_size: i64,
    pub storage_size: i64,
    pub indexes: i64,
    pub index_size: i64,
    pub total_size: i64,
    pub scale_factor: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MongoDatabaseStatsResult {
    pub success: bool,
    pub stats: Option<MongoDatabaseStats>,
    pub version: Option<String>,
    pub error: Option<String>,
}

/// Generic operation result
#[derive(Debug, Serialize)]
pub struct MongoOperationResult {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn mongo_list_databases(config: MongoConnectionConfig) -> Result<MongoListDatabasesResult, String> {
    let client = build_client(&config).await?;

    let admin_db = client.database("admin");
    let result = admin_db
        .run_command(doc! { "listDatabases": 1 })
        .await
        .map_err(|e| format!("Failed to list databases: {}", e))?;

    let databases: Vec<MongoDatabaseInfo> = match result.get("databases") {
        Some(Bson::Array(arr)) => arr
            .iter()
            .filter_map(|bson| {
                if let Bson::Document(d) = bson {
                    let name = d.get_str("name").unwrap_or("unknown").to_string();
                    let size_on_disk = doc_get_i64_opt(d, "sizeOnDisk");
                    let empty = d.get_bool("empty").ok();
                    // collections count is not directly provided by listDatabases
                    // we'll fetch it separately if needed, or set to None
                    Some(MongoDatabaseInfo {
                        name,
                        size_on_disk,
                        empty,
                        collections: None,
                    })
                } else {
                    None
                }
            })
            .collect(),
        _ => return Err("Unexpected response format from listDatabases".to_string()),
    };

    let total_size = result.get_i64("totalSize").ok();

    Ok(MongoListDatabasesResult {
        success: true,
        databases: Some(databases),
        total_size,
        error: None,
    })
}

#[tauri::command]
pub async fn mongo_list_collections(
    config: MongoConnectionConfig,
    database: String,
) -> Result<MongoListCollectionsResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);

    // Get list of collections with type info
    let collections_list: Vec<MongoCollectionInfo> = match db.list_collections().await {
        Ok(mut cursor) => {
            let mut infos: Vec<MongoCollectionInfo> = Vec::new();
            use futures::TryStreamExt;
            while let Some(spec) = cursor.try_next().await.map_err(|e| e.to_string())? {
                let name = spec.name;
                let coll_type = match spec.collection_type {
                        mongodb::results::CollectionType::Collection => "collection",
                        mongodb::results::CollectionType::View => "view",
                        mongodb::results::CollectionType::Timeseries => "timeseries",
                        _ => "unknown",
                    }.to_string();
                infos.push(MongoCollectionInfo {
                    name,
                    collection_type: coll_type,
                    document_count: None,
                    storage_size: None,
                    index_count: None,
                    avg_document_size: None,
                });
            }
            infos
        }
        Err(e) => return Err(format!("Failed to list collections: {}", e)),
    };

    // Get stats for each collection to populate counts and sizes
    let collections_with_stats: Vec<MongoCollectionInfo> = collections_list
        .into_iter()
        .map(|info| {
            // Run collStats for each collection (we'll do this synchronously in a separate call)
            info
        })
        .collect();

    Ok(MongoListCollectionsResult {
        success: true,
        collections: Some(collections_with_stats),
        error: None,
    })
}

#[tauri::command]
pub async fn mongo_collection_stats(
    config: MongoConnectionConfig,
    database: String,
    collection: String,
) -> Result<MongoCollectionStatsResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);

    let result = db
        .run_command(doc! { "collStats": collection.clone(), "scale": 1 })
        .await
        .map_err(|e| format!("Failed to get collection stats: {}", e))?;

    let stats = MongoCollectionStats {
        ns: result.get_str("ns").unwrap_or(&format!("{}.{}", database, collection)).to_string(),
        count: doc_get_i64(&result, "count"),
        size: doc_get_i64(&result, "size"),
        avg_obj_size: doc_get_i64_opt(&result, "avgObjSize"),
        storage_size: doc_get_i64(&result, "storageSize"),
        nindexes: doc_get_i64(&result, "nindexes"),
        total_index_size: doc_get_i64(&result, "totalIndexSize"),
        index_sizes: match result.get("indexSizes") {
            Some(Bson::Document(d)) => {
                let map: serde_json::Map<String, Value> = d
                    .iter()
                    .map(|(k, v)| (k.clone(), bson_to_json(v)))
                    .collect();
                Some(map)
            }
            _ => None,
        },
        capped: result.get_bool("capped").ok(),
        max: doc_get_i64_opt(&result, "max"),
        max_size: doc_get_i64_opt(&result, "maxSize"),
    };

    Ok(MongoCollectionStatsResult {
        success: true,
        stats: Some(stats),
        error: None,
    })
}

#[tauri::command]
pub async fn mongo_database_stats(
    config: MongoConnectionConfig,
    database: String,
) -> Result<MongoDatabaseStatsResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);

    let result = db
        .run_command(doc! { "dbStats": 1, "scale": 1 })
        .await
        .map_err(|e| format!("Failed to get database stats: {}", e))?;

    // Get MongoDB version from admin database
    let version = match client.database("admin").run_command(doc! { "buildInfo": 1 }).await {
        Ok(info) => info.get_str("version").ok().map(|v| v.to_string()),
        Err(_) => None,
    };

    let stats = MongoDatabaseStats {
        db: result.get_str("db").unwrap_or(&database).to_string(),
        collections: doc_get_i64(&result, "collections"),
        objects: doc_get_i64(&result, "objects"),
        avg_obj_size: doc_get_i64_opt(&result, "avgObjSize"),
        data_size: doc_get_i64(&result, "dataSize"),
        storage_size: doc_get_i64(&result, "storageSize"),
        indexes: doc_get_i64(&result, "indexes"),
        index_size: doc_get_i64(&result, "indexSize"),
        total_size: doc_get_i64(&result, "totalSize"),
        scale_factor: doc_get_i64_opt(&result, "scaleFactor"),
    };

    Ok(MongoDatabaseStatsResult {
        success: true,
        stats: Some(stats),
        version,
        error: None,
    })
}

#[tauri::command]
pub async fn mongo_create_database(
    config: MongoConnectionConfig,
    database: String,
    collection: String,
) -> Result<MongoOperationResult, String> {
    let client = build_client(&config).await?;

    // MongoDB creates databases implicitly when you first store data in them
    // We create a collection with a temporary document, then delete it
    let db = client.database(&database);
    let coll: mongodb::Collection<Document> = db.collection(&collection);

    // Generate a unique ObjectId for the temporary document to avoid collisions
    let temp_id = ObjectId::new();
    let temp_doc = doc! { "_id": temp_id, "created": true };
    coll.insert_one(temp_doc.clone())
        .await
        .map_err(|e| format!("Failed to create database: {}", e))?;

    // Delete the temporary document
    coll.delete_one(doc! { "_id": temp_id })
        .await
        .map_err(|e| format!("Failed to clean up temporary document: {}", e))?;

    Ok(MongoOperationResult {
        success: true,
        message: Some(format!("Database '{}' created successfully", database)),
        error: None,
    })
}

#[tauri::command]
pub async fn mongo_drop_database(
    config: MongoConnectionConfig,
    database: String,
) -> Result<MongoOperationResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);

    db.drop()
        .await
        .map_err(|e| format!("Failed to drop database: {}", e))?;

    Ok(MongoOperationResult {
        success: true,
        message: Some(format!("Database '{}' dropped successfully", database)),
        error: None,
    })
}

/// Options for creating a collection
#[derive(Debug, Deserialize)]
pub struct MongoCreateCollectionOptions {
    pub capped: Option<bool>,
    pub size: Option<i64>,
    pub max: Option<i64>,
    // Timeseries options
    pub timeseries: Option<MongoTimeseriesOptions>,
    // Validator
    pub validator: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct MongoTimeseriesOptions {
    pub time_field: String,
    pub meta_field: Option<String>,
    pub granularity: Option<String>,
}

#[tauri::command]
pub async fn mongo_create_collection(
    config: MongoConnectionConfig,
    database: String,
    collection: String,
    options: Option<MongoCreateCollectionOptions>,
) -> Result<MongoOperationResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);

    use mongodb::options::CreateCollectionOptions;

    let mut coll_options = CreateCollectionOptions::default();

    if let Some(opts) = options {
        if opts.capped == Some(true) {
            coll_options.capped = Some(true);
            if let Some(size) = opts.size {
                coll_options.size = Some(size as u64);
            }
            if let Some(max) = opts.max {
                coll_options.max = Some(max as u64);
            }
        }

        if let Some(ts_opts) = opts.timeseries {
            use mongodb::options::TimeseriesOptions;
            use mongodb::options::TimeseriesGranularity;

            let granularity = ts_opts.granularity.as_ref().and_then(|gran| {
                Some(match gran.as_str() {
                    "seconds" => TimeseriesGranularity::Seconds,
                    "minutes" => TimeseriesGranularity::Minutes,
                    "hours" => TimeseriesGranularity::Hours,
                    _ => TimeseriesGranularity::Minutes,
                })
            });

            let ts = TimeseriesOptions::builder()
                .time_field(&ts_opts.time_field)
                .meta_field(ts_opts.meta_field.clone())
                .granularity(granularity)
                .build();

            coll_options.timeseries = Some(ts);
        }

        if let Some(validator_val) = opts.validator {
            let validator_doc = json_to_bson_doc(validator_val)?;
            coll_options.validator = Some(validator_doc);
        }
    }

    db.create_collection(&collection)
        .with_options(coll_options)
        .await
        .map_err(|e| format!("Failed to create collection: {}", e))?;

    Ok(MongoOperationResult {
        success: true,
        message: Some(format!("Collection '{}' created successfully", collection)),
        error: None,
    })
}

#[tauri::command]
pub async fn mongo_drop_collection(
    config: MongoConnectionConfig,
    database: String,
    collection: String,
) -> Result<MongoOperationResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);

    db.collection::<Document>(&collection)
        .drop()
        .await
        .map_err(|e| format!("Failed to drop collection: {}", e))?;

    Ok(MongoOperationResult {
        success: true,
        message: Some(format!("Collection '{}' dropped successfully", collection)),
        error: None,
    })
}

// ==================== MongoDB Cluster Monitoring Commands ====================

/// Server status info
#[derive(Debug, Serialize)]
pub struct MongoServerStatus {
    pub host: String,
    pub version: String,
    pub uptime: i64,
    pub connections: MongoConnectionInfo,
    pub network: MongoNetworkInfo,
    pub memory: MongoMemoryInfo,
}

#[derive(Debug, Serialize)]
pub struct MongoConnectionInfo {
    pub current: i64,
    pub available: i64,
    pub total_created: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MongoNetworkInfo {
    pub bytes_in: i64,
    pub bytes_out: i64,
    pub num_requests: i64,
}

#[derive(Debug, Serialize)]
pub struct MongoMemoryInfo {
    pub resident: i64,
    pub virtual_mem: i64,
}

#[derive(Debug, Serialize)]
pub struct MongoServerStatusResult {
    pub success: bool,
    pub status: Option<MongoServerStatus>,
    pub error: Option<String>,
}

/// Replica set member info
#[derive(Debug, Serialize)]
pub struct MongoReplicaMember {
    pub name: String,
    pub state: i64,
    pub state_str: String,
    pub health: Option<i64>,
    pub uptime: i64,
    pub optime: Option<String>,
    pub optime_date: Option<String>,
    pub lag_time: Option<i64>,
    pub ping_ms: Option<i64>,
    pub election_time: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MongoReplicaSetStatus {
    pub set: String,
    pub date: Option<String>,
    pub my_state: i64,
    pub members: Vec<MongoReplicaMember>,
    pub election_time: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MongoReplSetStatusResult {
    pub success: bool,
    pub status: Option<MongoReplicaSetStatus>,
    pub error: Option<String>,
}

/// Shard info
#[derive(Debug, Serialize)]
pub struct MongoShardInfo {
    pub id: String,
    pub host: String,
    pub state: i64,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct MongoMongosInfo {
    pub id: String,
    pub host: String,
    pub ping: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MongoShardCluster {
    pub is_sharding_enabled: bool,
    pub mongos: Vec<MongoMongosInfo>,
    pub config_servers: Option<MongoConfigServerInfo>,
    pub shards: Vec<MongoShardInfo>,
}

#[derive(Debug, Serialize)]
pub struct MongoConfigServerInfo {
    pub type_: String,
    pub name: Option<String>,
    pub members: Option<Vec<MongoReplicaMember>>,
}

#[derive(Debug, Serialize)]
pub struct MongoShardStatusResult {
    pub success: bool,
    pub cluster: Option<MongoShardCluster>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn mongo_server_status(config: MongoConnectionConfig) -> Result<MongoServerStatusResult, String> {
    let client = build_client(&config).await?;
    let admin_db = client.database("admin");

    let result = admin_db
        .run_command(doc! { "serverStatus": 1 })
        .await
        .map_err(|e| format!("Failed to get server status: {}", e))?;

    // Get version from buildInfo
    let version = match admin_db.run_command(doc! { "buildInfo": 1 }).await {
        Ok(info) => info.get_str("version").unwrap_or("unknown").to_string(),
        Err(_) => "unknown".to_string(),
    };

    let status = MongoServerStatus {
        host: result.get_str("host").unwrap_or("unknown").to_string(),
        version,
        uptime: result.get_i64("uptime").unwrap_or(0),
        connections: MongoConnectionInfo {
            current: result.get_document("connections")
                .and_then(|d| d.get_i64("current"))
                .unwrap_or(0),
            available: result.get_document("connections")
                .and_then(|d| d.get_i64("available"))
                .unwrap_or(0),
            total_created: result.get_document("connections")
                .and_then(|d| d.get_i64("totalCreated"))
                .ok(),
        },
        network: MongoNetworkInfo {
            bytes_in: result.get_document("network")
                .and_then(|d| d.get_i64("bytesIn"))
                .unwrap_or(0),
            bytes_out: result.get_document("network")
                .and_then(|d| d.get_i64("bytesOut"))
                .unwrap_or(0),
            num_requests: result.get_document("network")
                .and_then(|d| d.get_i64("numRequests"))
                .unwrap_or(0),
        },
        memory: MongoMemoryInfo {
            resident: result.get_document("mem")
                .and_then(|d| d.get_i64("resident"))
                .unwrap_or(0),
            virtual_mem: result.get_document("mem")
                .and_then(|d| d.get_i64("virtual"))
                .unwrap_or(0),
        },
    };

    Ok(MongoServerStatusResult {
        success: true,
        status: Some(status),
        error: None,
    })
}

#[tauri::command]
pub async fn mongo_repl_set_status(config: MongoConnectionConfig) -> Result<MongoReplSetStatusResult, String> {
    let client = build_client(&config).await?;
    let admin_db = client.database("admin");

    // Try to get replica set status
    let result = admin_db
        .run_command(doc! { "replSetGetStatus": 1 })
        .await;

    match result {
        Ok(rs_result) => {
            let members: Vec<MongoReplicaMember> = match rs_result.get("members") {
                Some(Bson::Array(arr)) => arr
                    .iter()
                    .filter_map(|bson| {
                        if let Bson::Document(d) = bson {
                            Some(MongoReplicaMember {
                                name: d.get_str("name").unwrap_or("unknown").to_string(),
                                state: d.get_i64("state").unwrap_or(0),
                                state_str: d.get_str("stateStr").unwrap_or("UNKNOWN").to_string(),
                                health: d.get_i64("health").ok(),
                                uptime: d.get_i64("uptime").unwrap_or(0),
                                optime: d.get_document("optime")
                                    .ok()
                                    .and_then(|o| o.get_str("ts").ok())
                                    .map(|s| s.to_string()),
                                optime_date: d.get("optimeDate")
                                    .and_then(|b| {
                                        if let Bson::DateTime(dt) = b {
                                            Some(dt.to_string())
                                        } else {
                                            None
                                        }
                                    }),
                                lag_time: d.get_i64("lagTime").ok(),
                                ping_ms: d.get_i64("pingMs").ok(),
                                election_time: d.get("electionTime")
                                    .and_then(|b| {
                                        if let Bson::DateTime(dt) = b {
                                            Some(dt.to_string())
                                        } else {
                                            None
                                        }
                                    }),
                            })
                        } else {
                            None
                        }
                    })
                    .collect(),
                _ => vec![],
            };

            let status = MongoReplicaSetStatus {
                set: rs_result.get_str("set").unwrap_or("unknown").to_string(),
                date: rs_result.get("date")
                    .and_then(|b| {
                        if let Bson::DateTime(dt) = b {
                            Some(dt.to_string())
                        } else {
                            None
                        }
                    }),
                my_state: rs_result.get_i64("myState").unwrap_or(0),
                members,
                election_time: rs_result.get("electionTime")
                    .and_then(|b| {
                        if let Bson::DateTime(dt) = b {
                            Some(dt.to_string())
                        } else {
                            None
                        }
                    }),
            };

            Ok(MongoReplSetStatusResult {
                success: true,
                status: Some(status),
                error: None,
            })
        }
        Err(e) => {
            // Not a replica set or error
            Ok(MongoReplSetStatusResult {
                success: false,
                status: None,
                error: Some(format!("Not a replica set or error: {}", e)),
            })
        }
    }
}

#[tauri::command]
pub async fn mongo_shard_status(config: MongoConnectionConfig) -> Result<MongoShardStatusResult, String> {
    let client = build_client(&config).await?;
    let admin_db = client.database("admin");

    // Check if sharding is enabled
    let sharding_state = admin_db
        .run_command(doc! { "shardingState": 1 })
        .await;

    let is_sharding_enabled = sharding_state.is_ok();

    if !is_sharding_enabled {
        return Ok(MongoShardStatusResult {
            success: true,
            cluster: Some(MongoShardCluster {
                is_sharding_enabled: false,
                mongos: vec![],
                config_servers: None,
                shards: vec![],
            }),
            error: None,
        });
    }

    // Get list of shards
    let list_shards_result = admin_db
        .run_command(doc! { "listShards": 1 })
        .await;

    let shards: Vec<MongoShardInfo> = match list_shards_result {
        Ok(result) => match result.get("shards") {
            Some(Bson::Array(arr)) => arr
                .iter()
                .filter_map(|bson| {
                    if let Bson::Document(d) = bson {
                        let tags = d.get_array("tags").ok().map(|arr| {
                            arr.iter()
                                .filter_map(|b| {
                                    if let Bson::String(s) = b {
                                        Some(s.clone())
                                    } else {
                                        None
                                    }
                                })
                                .collect()
                        });
                        Some(MongoShardInfo {
                            id: d.get_str("_id").unwrap_or("unknown").to_string(),
                            host: d.get_str("host").unwrap_or("unknown").to_string(),
                            state: d.get_i64("state").unwrap_or(0),
                            tags,
                        })
                    } else {
                        None
                    }
                })
                .collect(),
            _ => vec![],
        },
        Err(_) => vec![],
    };

    // Get mongos info from config.mongos collection
    let mongos: Vec<MongoMongosInfo> = match client.database("config").collection::<Document>("mongos").find(doc! {}).await {
        Ok(mut cursor) => {
            let mut infos = vec![];
            while let Ok(Some(doc)) = cursor.try_next().await {
                infos.push(MongoMongosInfo {
                    id: doc.get_str("_id").unwrap_or("unknown").to_string(),
                    host: doc.get_str("host").unwrap_or("unknown").to_string(),
                    ping: doc.get_datetime("ping").ok().map(|dt| dt.timestamp_millis()),
                });
            }
            infos
        }
        Err(_) => vec![],
    };

    Ok(MongoShardStatusResult {
        success: true,
        cluster: Some(MongoShardCluster {
            is_sharding_enabled: true,
            mongos,
            config_servers: None, // Would need additional queries to get config server details
            shards,
        }),
        error: None,
    })
}

// ==================== Document CRUD Commands ====================

#[derive(Debug, Serialize)]
pub struct MongoFindDocumentsResult {
    pub success: bool,
    pub documents: Option<Vec<Value>>,
    pub total: Option<i64>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MongoWriteResult {
    pub success: bool,
    pub matched_count: Option<i64>,
    pub modified_count: Option<i64>,
    pub deleted_count: Option<i64>,
    pub inserted_id: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn mongo_find_documents(
    config: MongoConnectionConfig,
    collection: String,
    filter: Option<String>,
    sort: Option<String>,
    skip: Option<u64>,
    limit: Option<i64>,
) -> Result<MongoFindDocumentsResult, String> {
    let client = build_client(&config).await?;
    let db_name = config.database.ok_or("Database name is required")?;
    let db = client.database(&db_name);
    let coll = db.collection::<Document>(&collection);

    let filter_doc = match filter.as_deref() {
        Some(f) if !f.trim().is_empty() => parse_json_arg(f).and_then(json_to_bson_doc)?,
        _ => doc! {},
    };

    let total = coll.count_documents(filter_doc.clone()).await
        .map(|c| c as i64)
        .map_err(|e| e.to_string())?;

    let mut opts = mongodb::options::FindOptions::default();
    opts.skip = skip;
    opts.limit = Some(limit.unwrap_or(50));

    if let Some(sort_str) = sort.as_deref() {
        if !sort_str.trim().is_empty() {
            if let Ok(sort_doc) = parse_json_arg(sort_str).and_then(json_to_bson_doc) {
                opts.sort = Some(sort_doc);
            }
        }
    }

    let mut cursor = coll.find(filter_doc).with_options(opts).await
        .map_err(|e| e.to_string())?;

    let mut documents: Vec<Value> = vec![];
    while let Some(doc) = cursor.try_next().await.map_err(|e| e.to_string())? {
        documents.push(bson_to_json(&Bson::Document(doc)));
    }

    Ok(MongoFindDocumentsResult {
        success: true,
        documents: Some(documents),
        total: Some(total),
        error: None,
    })
}

#[tauri::command]
pub async fn mongo_count_documents(
    config: MongoConnectionConfig,
    collection: String,
    filter: Option<String>,
) -> Result<i64, String> {
    let client = build_client(&config).await?;
    let db_name = config.database.ok_or("Database name is required")?;
    let db = client.database(&db_name);
    let coll = db.collection::<Document>(&collection);

    let filter_doc = match filter.as_deref() {
        Some(f) if !f.trim().is_empty() => parse_json_arg(f).and_then(json_to_bson_doc)?,
        _ => doc! {},
    };

    let count = coll.count_documents(filter_doc).await.map_err(|e| e.to_string())?;
    Ok(count as i64)
}

#[tauri::command]
pub async fn mongo_insert_document(
    config: MongoConnectionConfig,
    collection: String,
    document: String,
) -> Result<MongoWriteResult, String> {
    let client = build_client(&config).await?;
    let db_name = config.database.ok_or("Database name is required")?;
    let db = client.database(&db_name);
    let coll = db.collection::<Document>(&collection);

    let doc = parse_json_arg(&document).and_then(json_to_bson_doc)?;

    match coll.insert_one(doc).await {
        Ok(result) => Ok(MongoWriteResult {
            success: true,
            matched_count: None,
            modified_count: None,
            deleted_count: None,
            inserted_id: Some(result.inserted_id.to_string()),
            error: None,
        }),
        Err(e) => Ok(MongoWriteResult {
            success: false,
            matched_count: None,
            modified_count: None,
            deleted_count: None,
            inserted_id: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn mongo_update_document(
    config: MongoConnectionConfig,
    collection: String,
    id: String,
    document: String,
) -> Result<MongoWriteResult, String> {
    let client = build_client(&config).await?;
    let db_name = config.database.ok_or("Database name is required")?;
    let db = client.database(&db_name);
    let coll = db.collection::<Document>(&collection);

    let filter = if let Ok(oid) = ObjectId::parse_str(&id) {
        doc! { "_id": oid }
    } else {
        doc! { "_id": &id }
    };

    let new_doc = parse_json_arg(&document).and_then(json_to_bson_doc)?;
    let update = doc! { "$set": new_doc };

    match coll.update_one(filter, update).await {
        Ok(result) => {
            if result.matched_count == 0 {
                Ok(MongoWriteResult {
                    success: false,
                    matched_count: Some(0),
                    modified_count: Some(0),
                    deleted_count: None,
                    inserted_id: None,
                    error: Some("No document matched the given id".to_string()),
                })
            } else {
                Ok(MongoWriteResult {
                    success: true,
                    matched_count: Some(result.matched_count as i64),
                    modified_count: Some(result.modified_count as i64),
                    deleted_count: None,
                    inserted_id: None,
                    error: None,
                })
            }
        }
        Err(e) => Ok(MongoWriteResult {
            success: false,
            matched_count: None,
            modified_count: None,
            deleted_count: None,
            inserted_id: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn mongo_delete_document(
    config: MongoConnectionConfig,
    collection: String,
    id: String,
) -> Result<MongoWriteResult, String> {
    let client = build_client(&config).await?;
    let db_name = config.database.ok_or("Database name is required")?;
    let db = client.database(&db_name);
    let coll = db.collection::<Document>(&collection);

    let filter = if let Ok(oid) = ObjectId::parse_str(&id) {
        doc! { "_id": oid }
    } else {
        doc! { "_id": &id }
    };

    match coll.delete_one(filter).await {
        Ok(result) => {
            if result.deleted_count == 0 {
                Ok(MongoWriteResult {
                    success: false,
                    matched_count: None,
                    modified_count: None,
                    deleted_count: Some(0),
                    inserted_id: None,
                    error: Some("No document matched the given id".to_string()),
                })
            } else {
                Ok(MongoWriteResult {
                    success: true,
                    matched_count: None,
                    modified_count: None,
                    deleted_count: Some(result.deleted_count as i64),
                    inserted_id: None,
                    error: None,
                })
            }
        }
        Err(e) => Ok(MongoWriteResult {
            success: false,
            matched_count: None,
            modified_count: None,
            deleted_count: None,
            inserted_id: None,
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn mongo_delete_documents(
    config: MongoConnectionConfig,
    collection: String,
    filter: String,
) -> Result<MongoWriteResult, String> {
    let client = build_client(&config).await?;
    let db_name = config.database.ok_or("Database name is required")?;
    let db = client.database(&db_name);
    let coll = db.collection::<Document>(&collection);

    let filter_doc = parse_json_arg(&filter).and_then(json_to_bson_doc)?;

    match coll.delete_many(filter_doc).await {
        Ok(result) => Ok(MongoWriteResult {
            success: true,
            matched_count: None,
            modified_count: None,
            deleted_count: Some(result.deleted_count as i64),
            inserted_id: None,
            error: None,
        }),
        Err(e) => Ok(MongoWriteResult {
            success: false,
            matched_count: None,
            modified_count: None,
            deleted_count: None,
            inserted_id: None,
            error: Some(e.to_string()),
        }),
    }
}

// ==================== Collection Management Commands ====================

/// Rename collection result
#[derive(Debug, Serialize)]
pub struct MongoRenameCollectionResult {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn mongo_rename_collection(
    config: MongoConnectionConfig,
    database: String,
    from_collection: String,
    to_collection: String,
) -> Result<MongoRenameCollectionResult, String> {
    let client = build_client(&config).await?;
    let admin_db = client.database("admin");

    // renameCollection must run against admin database
    // Format: { renameCollection: "sourceNamespace", to: "targetNamespace" }
    let source_ns = format!("{}.{}", database, from_collection);
    let target_ns = format!("{}.{}", database, to_collection);

    let result = admin_db
        .run_command(doc! {
            "renameCollection": source_ns,
            "to": target_ns
        })
        .await;

    match result {
        Ok(_) => Ok(MongoRenameCollectionResult {
            success: true,
            message: Some(format!(
                "Collection '{}' renamed to '{}' successfully",
                from_collection, to_collection
            )),
            error: None,
        }),
        Err(e) => Ok(MongoRenameCollectionResult {
            success: false,
            message: None,
            error: Some(format!("Failed to rename collection: {}", e)),
        }),
    }
}

/// Clone collection result
#[derive(Debug, Serialize)]
pub struct MongoCloneCollectionResult {
    pub success: bool,
    pub documents_copied: Option<i64>,
    pub indexes_copied: Option<i64>,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn mongo_clone_collection(
    config: MongoConnectionConfig,
    database: String,
    source_collection: String,
    target_collection: String,
) -> Result<MongoCloneCollectionResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);

    // Check if source collection exists
    let source_coll: mongodb::Collection<Document> = db.collection(&source_collection);

    // Get source collection info
    let source_list = db.list_collection_names().await
        .map_err(|e| format!("Failed to list collections: {}", e))?;

    if !source_list.contains(&source_collection) {
        return Ok(MongoCloneCollectionResult {
            success: false,
            documents_copied: None,
            indexes_copied: None,
            message: None,
            error: Some(format!("Source collection '{}' does not exist", source_collection)),
        });
    }

    // Check if target collection already exists
    if source_list.contains(&target_collection) {
        return Ok(MongoCloneCollectionResult {
            success: false,
            documents_copied: None,
            indexes_copied: None,
            message: None,
            error: Some(format!("Target collection '{}' already exists", target_collection)),
        });
    }

    // Copy all documents
    let mut cursor = source_coll.find(doc! {}).await
        .map_err(|e| format!("Failed to read source collection: {}", e))?;

    let target_coll: mongodb::Collection<Document> = db.collection(&target_collection);
    let mut docs: Vec<Document> = Vec::new();
    while let Some(doc) = cursor.try_next().await.map_err(|e| e.to_string())? {
        docs.push(doc);
    }

    let documents_count = docs.len() as i64;

    if !docs.is_empty() {
        target_coll.insert_many(docs).await
            .map_err(|e| format!("Failed to copy documents: {}", e))?;
    }

    // Copy indexes using $indexStats and listIndexes
    let index_result = db.run_command(doc! { "listIndexes": &source_collection }).await;

    let indexes_count = match index_result {
        Ok(index_doc) => {
            let indexes = match index_doc.get("cursor") {
                Some(Bson::Document(cursor)) => match cursor.get("firstBatch") {
                    Some(Bson::Array(arr)) => arr.clone(),
                    _ => vec![],
                },
                _ => vec![],
            };

            let mut created_indexes = 0i64;
            for idx_bson in indexes {
                if let Bson::Document(idx) = idx_bson {
                    // Skip the _id index (it's created automatically)
                    let name = idx.get_str("name").unwrap_or("");
                    if name == "_id_" {
                        continue;
                    }

                    // Get the key specification
                    let key = idx.get_document("key").ok();
                    if let Some(key_doc) = key {
                        let mut index_options = mongodb::options::IndexOptions::default();

                        // Copy unique if present
                        if let Some(true) = idx.get_bool("unique").ok() {
                            index_options.unique = Some(true);
                        }

                        // Copy sparse if present
                        if let Some(true) = idx.get_bool("sparse").ok() {
                            index_options.sparse = Some(true);
                        }

                        // Copy expireAfterSeconds for TTL indexes
                        if let Some(expire) = idx.get_i64("expireAfterSeconds").ok() {
                            index_options.expire_after = Some(std::time::Duration::from_secs(expire as u64));
                        }

                        // Build and create the index
                        let index_model = mongodb::IndexModel::builder()
                            .keys(key_doc.clone())
                            .options(index_options)
                            .build();

                        if target_coll.create_index(index_model).await.is_ok() {
                            created_indexes += 1;
                        }
                    }
                }
            }
            created_indexes
        },
        Err(_) => 0,
    };

    Ok(MongoCloneCollectionResult {
        success: true,
        documents_copied: Some(documents_count),
        indexes_copied: Some(indexes_count),
        message: Some(format!(
            "Collection '{}' cloned to '{}' successfully ({} documents, {} indexes)",
            source_collection, target_collection, documents_count, indexes_count
        )),
        error: None,
    })
}

/// Truncate (empty) collection result
#[derive(Debug, Serialize)]
pub struct MongoTruncateCollectionResult {
    pub success: bool,
    pub deleted_count: Option<i64>,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn mongo_truncate_collection(
    config: MongoConnectionConfig,
    database: String,
    collection: String,
) -> Result<MongoTruncateCollectionResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);
    let coll: mongodb::Collection<Document> = db.collection(&collection);

    // Delete all documents but keep the collection and its indexes
    let result = coll.delete_many(doc! {}).await
        .map_err(|e| format!("Failed to truncate collection: {}", e))?;

    Ok(MongoTruncateCollectionResult {
        success: true,
        deleted_count: Some(result.deleted_count as i64),
        message: Some(format!(
            "Collection '{}' emptied successfully ({} documents deleted, indexes preserved)",
            collection, result.deleted_count
        )),
        error: None,
    })
}

// ==================== Index Management Commands ====================

/// Index info
#[derive(Debug, Serialize)]
pub struct MongoIndexInfo {
    pub name: String,
    pub key: serde_json::Map<String, Value>,
    pub unique: Option<bool>,
    pub sparse: Option<bool>,
    pub ttl_seconds: Option<i64>,
    pub size: Option<i64>,
    pub accesses: Option<i64>,
    pub since: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct MongoListIndexesResult {
    pub success: bool,
    pub indexes: Option<Vec<MongoIndexInfo>>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn mongo_list_indexes(
    config: MongoConnectionConfig,
    database: String,
    collection: String,
) -> Result<MongoListIndexesResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);

    // Get list of indexes
    let index_result = db.run_command(doc! { "listIndexes": &collection }).await
        .map_err(|e| format!("Failed to list indexes: {}", e))?;

    let indexes: Vec<MongoIndexInfo> = match index_result.get("cursor") {
        Some(Bson::Document(cursor)) => match cursor.get("firstBatch") {
            Some(Bson::Array(arr)) => {
                arr.iter()
                    .filter_map(|bson| {
                        if let Bson::Document(idx) = bson {
                            let name = idx.get_str("name").unwrap_or("unknown").to_string();

                            // Get key specification
                            let key = match idx.get("key") {
                                Some(Bson::Document(k)) => {
                                    let map: serde_json::Map<String, Value> = k
                                        .iter()
                                        .map(|(k, v)| (k.clone(), bson_to_json(v)))
                                        .collect();
                                    map
                                },
                                _ => serde_json::Map::new(),
                            };

                            Some(MongoIndexInfo {
                                name,
                                key,
                                unique: idx.get_bool("unique").ok(),
                                sparse: idx.get_bool("sparse").ok(),
                                ttl_seconds: idx.get_i64("expireAfterSeconds").ok(),
                                size: None,
                                accesses: None,
                                since: None,
                            })
                        } else {
                            None
                        }
                    })
                    .collect()
            },
            _ => vec![],
        },
        _ => vec![],
    };

    // Get index sizes from collStats
    let stats_result = db.run_command(doc! { "collStats": &collection, "scale": 1 }).await.ok();
    let index_sizes: Option<std::collections::HashMap<String, i64>> = stats_result.and_then(|s| {
        match s.get("indexSizes") {
            Some(Bson::Document(d)) => {
                let map: std::collections::HashMap<String, i64> = d
                    .iter()
                    .filter_map(|(k, v)| {
                        match v {
                            Bson::Int64(n) => Some((k.clone(), *n)),
                            Bson::Int32(n) => Some((k.clone(), *n as i64)),
                            _ => None,
                        }
                    })
                    .collect();
                Some(map)
            },
            _ => None,
        }
    });

    // Get index usage stats from $indexStats aggregation
    let coll: mongodb::Collection<Document> = db.collection(&collection);
    let index_stats: std::collections::HashMap<String, (i64, Option<String>)> = match coll
        .aggregate(vec![doc! { "$indexStats": {} }])
        .await
    {
        Ok(mut cursor) => {
            let mut stats = std::collections::HashMap::new();
            while let Ok(Some(doc)) = cursor.try_next().await {
                let name = doc.get_str("name").unwrap_or("unknown").to_string();
                let accesses = doc.get_document("accesses")
                    .and_then(|a| a.get_i64("ops"))
                    .unwrap_or(0);
                let since = doc.get("since")
                    .and_then(|b| {
                        if let Bson::DateTime(dt) = b {
                            Some(dt.to_string())
                        } else {
                            None
                        }
                    });
                stats.insert(name, (accesses, since));
            }
            stats
        },
        Err(_) => std::collections::HashMap::new(),
    };

    // Merge index info with sizes and usage stats
    let indexes_with_stats: Vec<MongoIndexInfo> = indexes
        .into_iter()
        .map(|idx| {
            let size = index_sizes.as_ref().and_then(|s| s.get(&idx.name).copied());
            let (accesses, since) = index_stats.get(&idx.name)
                .map(|(a, s)| (*a, s.clone()))
                .unwrap_or((0, None));
            MongoIndexInfo {
                name: idx.name,
                key: idx.key,
                unique: idx.unique,
                sparse: idx.sparse,
                ttl_seconds: idx.ttl_seconds,
                size,
                accesses: Some(accesses),
                since,
            }
        })
        .collect();

    Ok(MongoListIndexesResult {
        success: true,
        indexes: Some(indexes_with_stats),
        error: None,
    })
}

/// Options for creating an index
#[derive(Debug, Deserialize)]
pub struct MongoCreateIndexOptions {
    pub name: Option<String>,
    pub unique: Option<bool>,
    pub sparse: Option<bool>,
    pub expire_after_seconds: Option<i64>,
    pub partial_filter_expression: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct MongoCreateIndexResult {
    pub success: bool,
    pub index_name: Option<String>,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn mongo_create_index(
    config: MongoConnectionConfig,
    database: String,
    collection: String,
    keys: Value,
    options: Option<MongoCreateIndexOptions>,
) -> Result<MongoCreateIndexResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);
    let coll: mongodb::Collection<Document> = db.collection(&collection);

    // Convert keys JSON to BSON document
    let keys_doc = json_to_bson_doc(keys)?;

    // Build index options
    let mut index_options = mongodb::options::IndexOptions::default();

    if let Some(opts) = options {
        if let Some(name) = opts.name {
            index_options.name = Some(name);
        }
        if opts.unique == Some(true) {
            index_options.unique = Some(true);
        }
        if opts.sparse == Some(true) {
            index_options.sparse = Some(true);
        }
        if let Some(expire) = opts.expire_after_seconds {
            index_options.expire_after = Some(std::time::Duration::from_secs(expire as u64));
        }
        if let Some(filter) = opts.partial_filter_expression {
            let filter_doc = json_to_bson_doc(filter)?;
            index_options.partial_filter_expression = Some(filter_doc);
        }
    }

    // Build and create the index
    let index_model = mongodb::IndexModel::builder()
        .keys(keys_doc)
        .options(index_options)
        .build();

    let result = coll.create_index(index_model).await
        .map_err(|e| format!("Failed to create index: {}", e))?;

    let index_name = result.index_name.clone();
    Ok(MongoCreateIndexResult {
        success: true,
        index_name: Some(result.index_name),
        message: Some(format!("Index '{}' created successfully", index_name)),
        error: None,
    })
}

#[derive(Debug, Serialize)]
pub struct MongoDropIndexResult {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn mongo_drop_index(
    config: MongoConnectionConfig,
    database: String,
    collection: String,
    index_name: String,
) -> Result<MongoDropIndexResult, String> {
    let client = build_client(&config).await?;
    let db = client.database(&database);
    let coll: mongodb::Collection<Document> = db.collection(&collection);

    // Cannot drop the _id index
    if index_name == "_id_" {
        return Ok(MongoDropIndexResult {
            success: false,
            message: None,
            error: Some("Cannot drop the default _id_ index".to_string()),
        });
    }

    coll.drop_index(&index_name).await
        .map_err(|e| format!("Failed to drop index: {}", e))?;

    Ok(MongoDropIndexResult {
        success: true,
        message: Some(format!("Index '{}' dropped successfully", index_name)),
        error: None,
    })
}
