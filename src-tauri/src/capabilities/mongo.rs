use std::sync::Arc;

use futures::TryStreamExt;
use mongodb::bson::Document;
use serde_json::Value;

use super::registry::CapabilityRegistry;
use super::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};

// ---------------------------------------------------------------------------
// MongoDB capability handlers
// ---------------------------------------------------------------------------

pub(crate) struct MongoListDatabases;
pub(crate) struct MongoListCollections;
pub(crate) struct MongoFind;
pub(crate) struct MongoAggregate;
pub(crate) struct MongoInsertOne;
pub(crate) struct MongoUpdateMany;
pub(crate) struct MongoDeleteMany;

#[async_trait::async_trait]
impl CapabilityHandler for MongoListDatabases {
    async fn handle(
        &self,
        _args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let names = client
            .list_database_names()
            .await
            .map_err(|e| format!("Failed to list databases: {}", e))?;
        let result = serde_json::json!({ "databases": names });
        Ok(crate::common::format::truncate_tool_output(result.to_string()))
    }
}

fn get_db_name(args: &Value, config: &Value) -> Result<String, String> {
    let config_db = config
        .get("database")
        .and_then(|v| v.as_str())
        .unwrap_or("test")
        .to_string();
    Ok(args
        .get("database")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(&config_db)
        .to_string())
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoListCollections {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = get_db_name(args, config)?;
        let db = client.database(&db_name);
        let names = db
            .list_collection_names()
            .await
            .map_err(|e| format!("Failed to list collections: {}", e))?;
        let result = serde_json::json!({ "collections": names });
        Ok(crate::common::format::truncate_tool_output(result.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoFind {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = get_db_name(args, config)?;
        let collection_name = args
            .get("collection")
            .and_then(|v| v.as_str())
            .ok_or("Missing collection")?;
        let filter_val = args.get("filter").cloned().unwrap_or(serde_json::json!({}));
        let filter = crate::common::bson::json_to_bson_doc_agent(&filter_val)?;
        let limit = args
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(20)
            .max(1)
            .min(100) as i64;

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);

        let mut find_options = mongodb::options::FindOptions::default();
        find_options.limit = Some(limit);
        if let Some(sort_val) = args.get("sort") {
            find_options.sort = Some(crate::common::bson::json_to_bson_doc_agent(sort_val)?);
        }
        if let Some(proj_val) = args.get("projection") {
            find_options.projection = Some(crate::common::bson::json_to_bson_doc_agent(proj_val)?);
        }

        let mut cursor = coll
            .find(filter)
            .with_options(find_options)
            .await
            .map_err(|e| format!("find failed: {}", e))?;
        let mut docs: Vec<Value> = Vec::new();
        while let Some(doc) = cursor
            .try_next()
            .await
            .map_err(|e| format!("cursor error: {}", e))?
        {
            docs.push(crate::common::bson::bson_to_value(
                &mongodb::bson::Bson::Document(doc),
            ));
        }
        let result = serde_json::json!({ "count": docs.len(), "documents": docs });
        Ok(crate::common::format::truncate_tool_output(result.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoAggregate {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = get_db_name(args, config)?;
        let collection_name = args
            .get("collection")
            .and_then(|v| v.as_str())
            .ok_or("Missing collection")?;
        let pipeline_val = args
            .get("pipeline")
            .and_then(|v| v.as_array())
            .ok_or("Missing or invalid pipeline")?;
        let pipeline: Vec<Document> = pipeline_val
            .iter()
            .map(crate::common::bson::json_to_bson_doc_agent)
            .collect::<Result<Vec<_>, _>>()?;

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);
        let mut cursor = coll
            .aggregate(pipeline)
            .await
            .map_err(|e| format!("aggregate failed: {}", e))?;
        let mut docs: Vec<Value> = Vec::new();
        while let Some(doc) = cursor
            .try_next()
            .await
            .map_err(|e| format!("cursor error: {}", e))?
        {
            docs.push(crate::common::bson::bson_to_value(
                &mongodb::bson::Bson::Document(doc),
            ));
            if docs.len() >= 100 {
                break;
            }
        }
        let result = serde_json::json!({ "count": docs.len(), "documents": docs });
        Ok(crate::common::format::truncate_tool_output(result.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoInsertOne {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = get_db_name(args, config)?;
        let collection_name = args
            .get("collection")
            .and_then(|v| v.as_str())
            .ok_or("Missing collection")?;
        let document_val = args.get("document").ok_or("Missing document")?;
        let document = crate::common::bson::json_to_bson_doc_agent(document_val)?;

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);
        let insert_result = coll
            .insert_one(document)
            .await
            .map_err(|e| format!("insert_one failed: {}", e))?;
        let inserted_id = crate::common::bson::bson_to_value(&insert_result.inserted_id);
        let result = serde_json::json!({ "inserted_id": inserted_id });
        Ok(crate::common::format::truncate_tool_output(result.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoUpdateMany {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = get_db_name(args, config)?;
        let collection_name = args
            .get("collection")
            .and_then(|v| v.as_str())
            .ok_or("Missing collection")?;
        let filter_val = args.get("filter").ok_or("Missing filter")?;
        let update_val = args.get("update").ok_or("Missing update")?;
        let filter = crate::common::bson::json_to_bson_doc_agent(filter_val)?;
        let update = crate::common::bson::json_to_bson_doc_agent(update_val)?;
        let upsert = args
            .get("upsert")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);
        let update_options = mongodb::options::UpdateOptions::builder()
            .upsert(upsert)
            .build();
        let update_result = coll
            .update_many(filter, update)
            .with_options(update_options)
            .await
            .map_err(|e| format!("update_many failed: {}", e))?;
        let result = serde_json::json!({
            "matched_count": update_result.matched_count,
            "modified_count": update_result.modified_count,
            "upserted_id": update_result.upserted_id.map(|id| {
                crate::common::bson::bson_to_value(&id)
            })
        });
        Ok(crate::common::format::truncate_tool_output(result.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoDeleteMany {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = get_db_name(args, config)?;
        let collection_name = args
            .get("collection")
            .and_then(|v| v.as_str())
            .ok_or("Missing collection")?;
        let filter_val = args.get("filter").ok_or("Missing filter")?;
        let filter = crate::common::bson::json_to_bson_doc_agent(filter_val)?;

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);
        let delete_result = coll
            .delete_many(filter)
            .await
            .map_err(|e| format!("delete_many failed: {}", e))?;
        let result = serde_json::json!({ "deleted_count": delete_result.deleted_count });
        Ok(crate::common::format::truncate_tool_output(result.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

pub(crate) fn register_all(registry: &mut CapabilityRegistry) {
    let mongo_schema = |props: &[(&str, &str, &str, bool)]| -> Value {
        let mut properties = serde_json::Map::new();
        properties.insert(
            "connection_id".to_string(),
            serde_json::json!({"type": "string", "description": "ID of the target connection from the session"}),
        );
        for (name, desc, type_str, _required) in props {
            let val = if *type_str == "object" || *type_str == "array" || *type_str == "integer" {
                serde_json::json!({"type": type_str, "description": desc})
            } else {
                serde_json::json!({"type": "string", "description": desc})
            };
            properties.insert(name.to_string(), val);
        }
        let required: Vec<String> = std::iter::once("connection_id".to_string())
            .chain(props.iter().filter(|(_, _, _, r)| *r).map(|(n, _, _, _)| n.to_string()))
            .collect();
        serde_json::json!({
            "type": "object",
            "properties": properties,
            "required": required,
        })
    };

    macro_rules! reg {
        ($name:expr, $desc:expr, $handler:expr, $schema:expr, $risk:expr, $perm:expr, $tags:expr) => {
            registry.register(Capability {
                name: $name,
                description: $desc,
                handler: Arc::new($handler),
                input_schema: $schema,
                risk_level: $risk,
                required_permission: $perm,
                source_kind: SourceKind::Database("MONGODB"),
                tags: $tags,
            });
        };
    }

    reg!("mongo__list_databases", "List all database names on a MongoDB server. Use this first when no database is known so you can pick one for subsequent calls.",
         MongoListDatabases,
         mongo_schema(&[]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!("mongo__list_collections", "List all collection names in a MongoDB database.",
         MongoListCollections,
         mongo_schema(&[("database", "MongoDB database name", "string", false)]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!("mongo__find", "Query documents from a MongoDB collection using a filter. Returns matching documents.",
         MongoFind,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name to query", "string", true),
             ("filter", "MongoDB query filter, e.g. {\"status\": \"active\"}", "object", true),
             ("projection", "Optional fields to include/exclude", "object", false),
             ("limit", "Maximum documents to return (default 20, max 100)", "integer", false),
             ("sort", "Optional sort specification", "object", false),
         ]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!("mongo__aggregate", "Execute a MongoDB aggregation pipeline on a collection.",
         MongoAggregate,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("pipeline", "Aggregation pipeline stages as array", "array", true),
         ]),
         RiskLevel::Elevated, "read", &["agent"]);

    reg!("mongo__insert_one", "Insert a single document into a MongoDB collection.",
         MongoInsertOne,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("document", "Document to insert", "object", true),
         ]),
         RiskLevel::Elevated, "create", &["agent", "ui"]);

    reg!("mongo__update_many", "Update documents in a MongoDB collection matching a filter.",
         MongoUpdateMany,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("filter", "Filter to match documents to update", "object", true),
             ("update", "Update operations, e.g. {\"$set\": {\"status\": \"inactive\"}}", "object", true),
             ("upsert", "If true, insert if none matches (default false)", "boolean", false),
         ]),
         RiskLevel::Elevated, "update", &["agent"]);

    reg!("mongo__delete_many", "Delete documents from a MongoDB collection matching a filter. DESTRUCTIVE: permanently removes data.",
         MongoDeleteMany,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("filter", "Filter to match documents to delete", "object", true),
         ]),
         RiskLevel::Destructive, "delete", &["agent", "ui"]);
}
