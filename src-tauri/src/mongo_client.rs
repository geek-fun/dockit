use futures::TryStreamExt;
use mongodb::bson::{doc, Bson, Document};
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
pub async fn mongo_test_connection(config: MongoConnectionConfig) -> Result<MongoTestResult, String> {
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
            let map: serde_json::Map<String, Value> =
                d.iter().map(|(k, v)| (k.clone(), bson_to_json(v))).collect();
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
        .map_err(|e| format!("Failed to parse argument '{}': {}", &s[..s.len().min(80)], e))
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
            if ch == '\\' { i += 2; continue; }
            if ch == string_char { in_string = false; }
            i += 1;
            continue;
        }
        match ch {
            '"' | '\'' => { in_string = true; string_char = ch; }
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
    if !last.is_empty() { args.push(last); }
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
            if *ch == '\\' { i += 1; byte_pos += ch.len_utf8(); continue; }
            if *ch == string_char { in_string = false; }
            i += 1;
            byte_pos += ch.len_utf8();
            continue;
        }
        match ch {
            '"' | '\'' => { in_string = true; string_char = *ch; }
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
            "limit" => { limit = arg_str.trim().parse::<i64>().ok(); }
            "skip" => { skip = arg_str.trim().parse::<u64>().ok(); }
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
        return Err(format!("Statement must start with 'db': {}", &code[..code.len().min(60)]));
    }

    let after_db = &code[2..];

    let (collection, rest) = if after_db.starts_with('[') {
        let end = after_db.find(']').ok_or("Unmatched '[' in collection accessor")?;
        let name = after_db[1..end].trim().trim_matches('"').trim_matches('\'').to_string();
        (name, &after_db[end + 1..])
    } else if after_db.starts_with(".getCollection(") {
        let start = ".getCollection(".len();
        let end = after_db[start..].find(')').map(|i| i + start)
            .ok_or("Unmatched '(' in getCollection")?;
        let name = after_db[start..end].trim().trim_matches('"').trim_matches('\'').to_string();
        (name, &after_db[end + 1..])
    } else if after_db.starts_with('.') {
        let rest = &after_db[1..];
        let dot_pos = rest.find('.').ok_or(format!("Missing method on collection: {}", code))?;
        (rest[..dot_pos].to_string(), &rest[dot_pos..])
    } else {
        return Err(format!("Cannot parse collection from: {}", &code[..code.len().min(60)]));
    };

    if !rest.starts_with('.') {
        return Err(format!("Expected '.' before method name, got: {}", &rest[..rest.len().min(20)]));
    }
    let rest = &rest[1..];

    let paren_pos = rest.find('(').ok_or(format!("Missing '(' for method call: {}", &rest[..rest.len().min(30)]))?;
    let method = rest[..paren_pos].trim().to_string();

    let (main_args_str, chain_str) = extract_balanced(&rest[paren_pos..])?;
    let args = split_top_level_args(&main_args_str);
    let (chain_limit, chain_skip, chain_sort) = parse_chain(chain_str)?;

    Ok(ParsedStatement { collection, method, args, chain_limit, chain_skip, chain_sort })
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
            if ch == '\\' { i += 2; continue; }
            if ch == string_char { in_string = false; }
            i += 1;
            continue;
        }
        match ch {
            '"' | '\'' | '`' => {
                in_string = true;
                string_char = ch;
                if stmt_start.is_none() { stmt_start = Some(i); }
            }
            '{' | '[' | '(' => {
                depth += 1;
                if stmt_start.is_none() { stmt_start = Some(i); }
            }
            '}' | ']' | ')' => {
                if depth > 0 { depth -= 1; }
            }
            '\n' | ';' if depth == 0 => {
                if let Some(start) = stmt_start {
                    let stmt: String = chars[start..i].iter().collect();
                    let stmt = stmt.trim().to_string();
                    if stmt.starts_with("db") { statements.push(stmt); }
                    stmt_start = None;
                }
            }
            ' ' | '\t' | '\r' if stmt_start.is_none() => {}
            _ => { if stmt_start.is_none() { stmt_start = Some(i); } }
        }
        i += 1;
    }

    if let Some(start) = stmt_start {
        let stmt: String = chars[start..].iter().collect();
        let stmt = stmt.trim().trim_end_matches(';').trim().to_string();
        if stmt.starts_with("db") { statements.push(stmt); }
    }

    if statements.is_empty() {
        let single = code.trim().trim_end_matches(';').trim().to_string();
        if !single.is_empty() { statements.push(single); }
    }

    statements
}

async fn execute_statement(client: &Client, db_name: &str, stmt: ParsedStatement) -> Result<Value, String> {
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
        other => Err(format!(
            "Unsupported method '{}'. Supported: find, findOne, countDocuments, estimatedDocumentCount, insertOne, insertMany, updateOne, updateMany, replaceOne, deleteOne, deleteMany, aggregate, distinct, createIndex, dropIndex, drop",
            other
        )),
    }
}

#[tauri::command]
pub async fn mongo_execute_query(
    config: MongoConnectionConfig,
    code: String,
) -> Result<MongoQueryResult, String> {
    let db_name = config.database.clone().unwrap_or_else(|| "test".to_string());

    let client = match build_client(&config).await {
        Ok(c) => c,
        Err(e) => return Ok(MongoQueryResult { success: false, data: None, error: Some(e) }),
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
            Err(e) => return Ok(MongoQueryResult { success: false, data: None, error: Some(e) }),
        };
        match execute_statement(&client, &db_name, stmt).await {
            Ok(result) => last_result = result,
            Err(e) => return Ok(MongoQueryResult { success: false, data: None, error: Some(e) }),
        }
    }

    Ok(MongoQueryResult { success: true, data: Some(last_result), error: None })
}

async fn build_client(config: &MongoConnectionConfig) -> Result<Client, String> {
    let uri = build_uri(config);
    let client_options = ClientOptions::parse(&uri)
        .await
        .map_err(|e| format!("Failed to parse connection options: {}", e))?;
    Client::with_options(client_options).map_err(|e| format!("Failed to create client: {}", e))
}
