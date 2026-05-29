use std::sync::Arc;

use futures::TryStreamExt;
use mongodb::bson::{doc, oid::ObjectId, Bson, Document};
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

pub(crate) struct MongoCollectionStats;
pub(crate) struct MongoDatabaseStats;
pub(crate) struct MongoCreateDatabase;
pub(crate) struct MongoDropDatabase;
pub(crate) struct MongoCreateCollection;
pub(crate) struct MongoDropCollection;
pub(crate) struct MongoServerStatus;
pub(crate) struct MongoReplSetStatus;
pub(crate) struct MongoShardStatus;
pub(crate) struct MongoCountDocuments;
pub(crate) struct MongoUpdateDocument;
pub(crate) struct MongoDeleteDocument;
pub(crate) struct MongoRenameCollection;
pub(crate) struct MongoCloneCollection;
pub(crate) struct MongoTruncateCollection;
pub(crate) struct MongoListIndexes;
pub(crate) struct MongoCreateIndex;
pub(crate) struct MongoDropIndex;
pub(crate) struct MongoSampleDocuments;

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
// Statistics handlers
// ---------------------------------------------------------------------------

#[async_trait::async_trait]
impl CapabilityHandler for MongoCollectionStats {
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

        let db = client.database(&db_name);
        let result = db
            .run_command(doc! { "collStats": collection_name, "scale": 1 })
            .await
            .map_err(|e| format!("collStats failed: {}", e))?;

        let get_num = |d: &Document, k: &str| -> i64 {
            d.get_i64(k).ok()
                .or_else(|| d.get_i32(k).ok().map(|v| v as i64))
                .unwrap_or(0)
        };

        let index_sizes = match result.get("indexSizes") {
            Some(Bson::Document(d)) => {
                let map: serde_json::Map<String, Value> = d
                    .iter()
                    .map(|(k, v)| (k.clone(), crate::common::bson::bson_to_value(v)))
                    .collect();
                Some(Value::Object(map))
            }
            _ => None,
        };

        let stats = serde_json::json!({
            "ns": result.get_str("ns").unwrap_or(&format!("{}.{}", db_name, collection_name)),
            "count": get_num(&result, "count"),
            "size": get_num(&result, "size"),
            "avgObjSize": result.get_f64("avgObjSize").ok(),
            "storageSize": get_num(&result, "storageSize"),
            "nindexes": get_num(&result, "nindexes"),
            "totalIndexSize": get_num(&result, "totalIndexSize"),
            "indexSizes": index_sizes,
            "capped": result.get_bool("capped").ok(),
            "max": result.get_i64("max").ok(),
            "maxSize": result.get_i64("maxSize").ok(),
        });

        let out = serde_json::json!({ "success": true, "stats": stats });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoDatabaseStats {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = get_db_name(args, config)?;

        let db = client.database(&db_name);
        let result = db
            .run_command(doc! { "dbStats": 1, "scale": 1 })
            .await
            .map_err(|e| format!("dbStats failed: {}", e))?;

        let version = client
            .database("admin")
            .run_command(doc! { "buildInfo": 1 })
            .await
            .ok()
            .and_then(|info| info.get_str("version").ok().map(|v| v.to_string()));

        let get_num = |d: &Document, k: &str| -> i64 {
            d.get_i64(k).ok()
                .or_else(|| d.get_i32(k).ok().map(|v| v as i64))
                .unwrap_or(0)
        };

        let stats = serde_json::json!({
            "db": result.get_str("db").unwrap_or(&db_name),
            "collections": get_num(&result, "collections"),
            "objects": get_num(&result, "objects"),
            "avgObjSize": result.get_f64("avgObjSize").ok(),
            "dataSize": get_num(&result, "dataSize"),
            "storageSize": get_num(&result, "storageSize"),
            "indexes": get_num(&result, "indexes"),
            "indexSize": get_num(&result, "indexSize"),
            "totalSize": get_num(&result, "totalSize"),
            "scaleFactor": result.get_i32("scaleFactor").ok().map(|v| v as i64),
        });

        let out = serde_json::json!({ "success": true, "stats": stats, "version": version });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Database lifecycle handlers
// ---------------------------------------------------------------------------

#[async_trait::async_trait]
impl CapabilityHandler for MongoCreateDatabase {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = args
            .get("database")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or("Missing database")?;
        let collection_name = args
            .get("collection")
            .and_then(|v| v.as_str())
            .ok_or("Missing collection")?;

        let db = client.database(db_name);
        let coll = db.collection::<Document>(collection_name);
        let temp_id = ObjectId::new();
        coll.insert_one(doc! { "_id": temp_id, "created": true })
            .await
            .map_err(|e| format!("Failed to create database: {}", e))?;
        coll.delete_one(doc! { "_id": temp_id })
            .await
            .map_err(|e| format!("Failed to clean up: {}", e))?;

        let out = serde_json::json!({ "success": true, "message": format!("Database '{}' created successfully", db_name) });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoDropDatabase {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = args
            .get("database")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or("Missing database")?;

        client.database(db_name)
            .drop()
            .await
            .map_err(|e| format!("Failed to drop database: {}", e))?;

        let out = serde_json::json!({ "success": true, "message": format!("Database '{}' dropped successfully", db_name) });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Collection lifecycle handlers
// ---------------------------------------------------------------------------

#[async_trait::async_trait]
impl CapabilityHandler for MongoCreateCollection {
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

        let db = client.database(&db_name);
        let mut coll_opts = mongodb::options::CreateCollectionOptions::default();

        if let Some(opts_val) = args.get("options").and_then(|v| v.as_object()) {
            if let Some(capped) = opts_val.get("capped").and_then(|v| v.as_bool()) {
                coll_opts.capped = Some(capped);
            }
            if let Some(size) = opts_val.get("size").and_then(|v| v.as_u64()) {
                coll_opts.size = Some(size);
            }
            if let Some(max) = opts_val.get("max").and_then(|v| v.as_u64()) {
                coll_opts.max = Some(max);
            }
            if let Some(ts) = opts_val.get("timeseries").and_then(|v| v.as_object()) {
                let time_field = ts.get("timeField").and_then(|v| v.as_str()).ok_or("timeseries requires timeField")?;
                let mut ts_opts = mongodb::options::TimeseriesOptions::builder()
                    .time_field(time_field)
                    .build();
                if let Some(meta) = ts.get("metaField").and_then(|v| v.as_str()) {
                    ts_opts.meta_field = Some(meta.to_string());
                }
                if let Some(gran) = ts.get("granularity").and_then(|v| v.as_str()) {
                    let g = match gran {
                        "seconds" => mongodb::options::TimeseriesGranularity::Seconds,
                        "minutes" => mongodb::options::TimeseriesGranularity::Minutes,
                        "hours" => mongodb::options::TimeseriesGranularity::Hours,
                        _ => mongodb::options::TimeseriesGranularity::Seconds,
                    };
                    ts_opts.granularity = Some(g);
                }
                coll_opts.timeseries = Some(ts_opts);
            }
            if let Some(validator_val) = opts_val.get("validator") {
                let validator_doc = crate::common::bson::json_to_bson_doc_agent(validator_val)?;
                coll_opts.validator = Some(validator_doc);
            }
        }

        db.create_collection(collection_name)
            .with_options(coll_opts)
            .await
            .map_err(|e| format!("Failed to create collection: {}", e))?;

        let out = serde_json::json!({ "success": true, "message": format!("Collection '{}' created successfully", collection_name) });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoDropCollection {
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

        client
            .database(&db_name)
            .collection::<Document>(collection_name)
            .drop()
            .await
            .map_err(|e| format!("Failed to drop collection: {}", e))?;

        let out = serde_json::json!({ "success": true, "message": format!("Collection '{}' dropped successfully", collection_name) });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Server monitoring handlers
// ---------------------------------------------------------------------------

#[async_trait::async_trait]
impl CapabilityHandler for MongoServerStatus {
    async fn handle(
        &self,
        _args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let admin_db = client.database("admin");

        let result = admin_db
            .run_command(doc! { "serverStatus": 1 })
            .await
            .map_err(|e| format!("serverStatus failed: {}", e))?;

        let version = admin_db
            .run_command(doc! { "buildInfo": 1 })
            .await
            .ok()
            .and_then(|info| info.get_str("version").ok().map(|v| v.to_string()))
            .unwrap_or_else(|| "unknown".to_string());

        let get_num = |d: &Document, k: &str| -> i64 {
            d.get_i64(k).ok()
                .or_else(|| d.get_i32(k).ok().map(|v| v as i64))
                .or_else(|| d.get_f64(k).ok().map(|v| v as i64))
                .unwrap_or(0)
        };

        let host = result.get_str("host").unwrap_or("unknown").to_string();
        let uptime = get_num(&result, "uptime");

        let connections = result.get_document("connections").ok().map(|d| {
            serde_json::json!({
                "current": get_num(&d, "current"),
                "available": get_num(&d, "available"),
                "totalCreated": d.get_i64("totalCreated").ok()
                    .or_else(|| d.get_i32("totalCreated").ok().map(|v| v as i64)),
            })
        });

        let network = result.get_document("network").ok().map(|d| {
            serde_json::json!({
                "bytesIn": get_num(&d, "bytesIn"),
                "bytesOut": get_num(&d, "bytesOut"),
                "numRequests": get_num(&d, "numRequests"),
            })
        });

        let memory = result.get_document("mem").ok().map(|d| {
            serde_json::json!({
                "resident": get_num(&d, "resident"),
                "virtualMem": get_num(&d, "virtual"),
            })
        });

        let status = serde_json::json!({
            "host": host,
            "version": version,
            "uptime": uptime,
            "connections": connections,
            "network": network,
            "memory": memory,
        });

        let out = serde_json::json!({ "success": true, "status": status });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoReplSetStatus {
    async fn handle(
        &self,
        _args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let admin_db = client.database("admin");

        let result = match admin_db.run_command(doc! { "replSetGetStatus": 1 }).await {
            Ok(r) => r,
            Err(e) => {
                let out = serde_json::json!({ "success": false, "error": format!("Not a replica set or error: {}", e) });
                return Ok(crate::common::format::truncate_tool_output(out.to_string()));
            }
        };

        let members: Vec<Value> = match result.get("members") {
            Some(Bson::Array(arr)) => arr
                .iter()
                .filter_map(|bson| {
                    if let Bson::Document(d) = bson {
                        Some(serde_json::json!({
                            "name": d.get_str("name").unwrap_or("unknown"),
                            "state": d.get_i64("state").unwrap_or(0),
                            "stateStr": d.get_str("stateStr").unwrap_or("UNKNOWN"),
                            "health": d.get_i64("health").ok(),
                            "uptime": d.get_i64("uptime").unwrap_or(0),
                        }))
                    } else {
                        None
                    }
                })
                .collect(),
            _ => vec![],
        };

        let status = serde_json::json!({
            "set": result.get_str("set").unwrap_or("unknown"),
            "myState": result.get_i64("myState").unwrap_or(0),
            "members": members,
        });

        let out = serde_json::json!({ "success": true, "status": status });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoShardStatus {
    async fn handle(
        &self,
        _args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let admin_db = client.database("admin");

        let is_sharding = admin_db.run_command(doc! { "shardingState": 1 }).await.is_ok();

        if !is_sharding {
            let out = serde_json::json!({
                "success": true,
                "cluster": { "isShardingEnabled": false, "shards": [], "mongos": [] }
            });
            return Ok(crate::common::format::truncate_tool_output(out.to_string()));
        }

        let shards: Vec<Value> = match admin_db.run_command(doc! { "listShards": 1 }).await {
            Ok(list) => match list.get("shards") {
                Some(Bson::Array(arr)) => arr
                    .iter()
                    .filter_map(|bson| {
                        if let Bson::Document(d) = bson {
                            Some(serde_json::json!({
                                "_id": d.get_str("_id").unwrap_or("unknown"),
                                "host": d.get_str("host").unwrap_or("unknown"),
                                "state": d.get_i64("state").unwrap_or(0),
                            }))
                        } else {
                            None
                        }
                    })
                    .collect(),
                _ => vec![],
            },
            Err(_) => vec![],
        };

        let mongos: Vec<Value> = match client
            .database("config")
            .collection::<Document>("mongos")
            .find(doc! {})
            .await
        {
            Ok(mut cursor) => {
                let mut list = vec![];
                while let Ok(Some(d)) = futures::TryStreamExt::try_next(&mut cursor).await {
                    list.push(serde_json::json!({
                        "_id": d.get_str("_id").unwrap_or("unknown"),
                        "host": d.get_str("host").unwrap_or("unknown"),
                    }));
                }
                list
            }
            Err(_) => vec![],
        };

        let out = serde_json::json!({
            "success": true,
            "cluster": {
                "isShardingEnabled": true,
                "shards": shards,
                "mongos": mongos,
            }
        });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Document operation handlers
// ---------------------------------------------------------------------------

#[async_trait::async_trait]
impl CapabilityHandler for MongoCountDocuments {
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

        let filter = match args.get("filter").and_then(|v| v.as_str()) {
            Some(f) if !f.is_empty() => {
                let filter_val: Value = serde_json::from_str(f)
                    .map_err(|e| format!("Invalid filter JSON: {}", e))?;
                crate::common::bson::json_to_bson_doc_agent(&filter_val)?
            }
            _ => doc! {},
        };

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);
        let count = coll
            .count_documents(filter)
            .await
            .map_err(|e| format!("count_documents failed: {}", e))?;

        let out = serde_json::json!({ "count": count });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoUpdateDocument {
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
        let id_str = args
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or("Missing id")?;
        let document_str = args
            .get("document")
            .and_then(|v| v.as_str())
            .ok_or("Missing document")?;

        let doc_val: Value = serde_json::from_str(document_str)
            .map_err(|e| format!("Invalid document JSON: {}", e))?;
        let new_doc = crate::common::bson::json_to_bson_doc_agent(&doc_val)?;
        let update = doc! { "$set": new_doc };

        let filter = if let Ok(oid) = ObjectId::parse_str(id_str) {
            doc! { "$or": [{ "_id": oid }, { "_id": id_str }] }
        } else {
            doc! { "_id": id_str }
        };

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);
        let result = coll
            .update_one(filter, update)
            .await
            .map_err(|e| format!("update_one failed: {}", e))?;

        let out = serde_json::json!({
            "success": result.matched_count > 0,
            "matched_count": result.matched_count,
            "modified_count": result.modified_count,
            "error": if result.matched_count == 0 { Some("No document matched the given id".to_string()) } else { Option::<String>::None },
        });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoDeleteDocument {
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
        let id_str = args
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or("Missing id")?;

        let filter = if let Ok(oid) = ObjectId::parse_str(id_str) {
            doc! { "$or": [{ "_id": oid }, { "_id": id_str }] }
        } else {
            doc! { "_id": id_str }
        };

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);
        let result = coll
            .delete_one(filter)
            .await
            .map_err(|e| format!("delete_one failed: {}", e))?;

        let out = serde_json::json!({
            "success": result.deleted_count > 0,
            "deleted_count": result.deleted_count,
            "error": if result.deleted_count == 0 { Some("No document matched the given id".to_string()) } else { Option::<String>::None },
        });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Collection management handlers
// ---------------------------------------------------------------------------

#[async_trait::async_trait]
impl CapabilityHandler for MongoRenameCollection {
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
        let to_collection = args
            .get("to_collection")
            .and_then(|v| v.as_str())
            .ok_or("Missing to_collection")?;

        let source_ns = format!("{}.{}", db_name, collection_name);
        let target_ns = format!("{}.{}", db_name, to_collection);

        client
            .database("admin")
            .run_command(doc! {
                "renameCollection": &source_ns,
                "to": &target_ns,
            })
            .await
            .map_err(|e| format!("renameCollection failed: {}", e))?;

        let out = serde_json::json!({
            "success": true,
            "message": format!("Collection '{}' renamed to '{}'", collection_name, to_collection),
        });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoCloneCollection {
    async fn handle(
        &self,
        args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = crate::common::mongo::create_mongo_client_from_config(config).await?;
        let db_name = get_db_name(args, config)?;
        let source_coll = args
            .get("source_collection")
            .and_then(|v| v.as_str())
            .ok_or("Missing source_collection")?;
        let target_coll = args
            .get("target_collection")
            .and_then(|v| v.as_str())
            .ok_or("Missing target_collection")?;

        let db = client.database(&db_name);

        let names = db
            .list_collection_names()
            .await
            .map_err(|e| format!("Failed to list collections: {}", e))?;
        if !names.contains(&source_coll.to_string()) {
            let out = serde_json::json!({
                "success": false,
                "error": format!("Source collection '{}' does not exist", source_coll)
            });
            return Ok(crate::common::format::truncate_tool_output(out.to_string()));
        }
        if names.contains(&target_coll.to_string()) {
            let out = serde_json::json!({
                "success": false,
                "error": format!("Target collection '{}' already exists", target_coll)
            });
            return Ok(crate::common::format::truncate_tool_output(out.to_string()));
        }

        let src = db.collection::<Document>(source_coll);
        let mut cursor = src
            .find(doc! {})
            .await
            .map_err(|e| format!("Failed to read source: {}", e))?;
        let mut docs: Vec<Document> = Vec::new();
        while let Some(d) = cursor
            .try_next()
            .await
            .map_err(|e| format!("Cursor error: {}", e))?
        {
            docs.push(d);
        }
        let doc_count = docs.len() as i64;

        if !docs.is_empty() {
            let tgt = db.collection::<Document>(target_coll);
            tgt.insert_many(docs)
                .await
                .map_err(|e| format!("Failed to copy documents: {}", e))?;
        }

        let index_result = db.run_command(doc! { "listIndexes": source_coll }).await;
        let index_count = match index_result {
            Ok(index_doc) => {
                let indexes = match index_doc.get("cursor") {
                    Some(Bson::Document(c)) => c
                        .get_array("firstBatch")
                        .ok()
                        .cloned()
                        .unwrap_or_default(),
                    _ => vec![],
                };
                let mut created = 0i64;
                let tgt = db.collection::<Document>(target_coll);
                for idx_bson in &indexes {
                    if let Bson::Document(idx) = idx_bson {
                        let name = idx.get_str("name").unwrap_or("");
                        if name == "_id_" {
                            continue;
                        }
                        if let Ok(key_doc) = idx.get_document("key") {
                            let mut idx_opts = mongodb::options::IndexOptions::default();
                            if let Ok(true) = idx.get_bool("unique") {
                                idx_opts.unique = Some(true);
                            }
                            if let Ok(true) = idx.get_bool("sparse") {
                                idx_opts.sparse = Some(true);
                            }
                            if let Ok(expire) = idx.get_i64("expireAfterSeconds") {
                                idx_opts.expire_after =
                                    Some(std::time::Duration::from_secs(expire as u64));
                            }
                            let model = mongodb::IndexModel::builder()
                                .keys(key_doc.clone())
                                .options(idx_opts)
                                .build();
                            if tgt.create_index(model).await.is_ok() {
                                created += 1;
                            }
                        }
                    }
                }
                created
            }
            Err(_) => 0,
        };

        let out = serde_json::json!({
            "success": true,
            "documents_copied": doc_count,
            "indexes_copied": index_count,
        });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoTruncateCollection {
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

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);
        let result = coll
            .delete_many(doc! {})
            .await
            .map_err(|e| format!("truncate failed: {}", e))?;

        let out = serde_json::json!({
            "success": true,
            "deleted_count": result.deleted_count,
        });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

// ---------------------------------------------------------------------------
// Index management handlers
// ---------------------------------------------------------------------------

#[async_trait::async_trait]
impl CapabilityHandler for MongoListIndexes {
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

        let db = client.database(&db_name);
        let index_result = db
            .run_command(doc! { "listIndexes": collection_name })
            .await
            .map_err(|e| format!("listIndexes failed: {}", e))?;

        let indexes: Vec<Value> = match index_result.get("cursor") {
            Some(Bson::Document(c)) => match c.get("firstBatch") {
                Some(Bson::Array(arr)) => arr
                    .iter()
                    .filter_map(|bson| {
                        if let Bson::Document(idx) = bson {
                            let key = match idx.get("key") {
                                Some(Bson::Document(k)) => {
                                    let map: serde_json::Map<String, Value> = k
                                        .iter()
                                        .map(|(k, v)| {
                                            (k.clone(), crate::common::bson::bson_to_value(v))
                                        })
                                        .collect();
                                    Value::Object(map)
                                }
                                _ => Value::Object(serde_json::Map::new()),
                            };
                            Some(serde_json::json!({
                                "name": idx.get_str("name").unwrap_or("unknown"),
                                "key": key,
                                "unique": idx.get_bool("unique").ok(),
                                "sparse": idx.get_bool("sparse").ok(),
                                "expireAfterSeconds": idx.get_i64("expireAfterSeconds").ok(),
                            }))
                        } else {
                            None
                        }
                    })
                    .collect(),
                _ => vec![],
            },
            _ => vec![],
        };

        let out = serde_json::json!({ "success": true, "indexes": indexes });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoCreateIndex {
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
        let keys_val = args.get("keys").ok_or("Missing keys")?;
        let keys = crate::common::bson::json_to_bson_doc_agent(keys_val)?;

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);

        let mut idx_opts = mongodb::options::IndexOptions::default();
        if let Some(name) = args
            .get("name")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            idx_opts.name = Some(name.to_string());
        }
        if args
            .get("unique")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            idx_opts.unique = Some(true);
        }
        if args
            .get("sparse")
            .and_then(|v| v.as_bool())
            .unwrap_or(false)
        {
            idx_opts.sparse = Some(true);
        }
        if let Some(expire) = args
            .get("expire_after_seconds")
            .and_then(|v| v.as_u64())
        {
            idx_opts.expire_after = Some(std::time::Duration::from_secs(expire));
        }

        let model = mongodb::IndexModel::builder()
            .keys(keys)
            .options(idx_opts)
            .build();
        let result = coll
            .create_index(model)
            .await
            .map_err(|e| format!("create_index failed: {}", e))?;

        let out = serde_json::json!({ "success": true, "index_name": result.index_name });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoDropIndex {
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
        let index_name = args
            .get("index_name")
            .and_then(|v| v.as_str())
            .ok_or("Missing index_name")?;

        if index_name == "_id_" {
            let out = serde_json::json!({
                "success": false,
                "error": "Cannot drop the default _id_ index".to_string()
            });
            return Ok(crate::common::format::truncate_tool_output(out.to_string()));
        }

        client
            .database(&db_name)
            .collection::<Document>(collection_name)
            .drop_index(index_name)
            .await
            .map_err(|e| format!("drop_index failed: {}", e))?;

        let out = serde_json::json!({
            "success": true,
            "message": format!("Index '{}' dropped successfully", index_name),
        });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoSampleDocuments {
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
        let limit = args
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(10)
            .max(1)
            .min(1000) as i64;

        let db = client.database(&db_name);
        let coll = db.collection::<Document>(collection_name);
        let opts = mongodb::options::FindOptions::builder().limit(limit).build();
        let mut cursor = coll
            .find(doc! {})
            .with_options(opts)
            .await
            .map_err(|e| format!("find failed: {}", e))?;

        let mut docs: Vec<Value> = Vec::new();
        while let Some(d) = cursor
            .try_next()
            .await
            .map_err(|e| format!("cursor error: {}", e))?
        {
            docs.push(crate::common::bson::bson_to_value(
                &mongodb::bson::Bson::Document(d),
            ));
        }

        let out = serde_json::json!({ "documents": docs, "count": docs.len() });
        Ok(crate::common::format::truncate_tool_output(out.to_string()))
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

    reg!("mongo__collection_stats", "Get detailed statistics for a MongoDB collection including document count, storage size, and index sizes.",
         MongoCollectionStats,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
         ]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("mongo__database_stats", "Get statistics for a MongoDB database including collection count, object count, and storage metrics.",
         MongoDatabaseStats,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
         ]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("mongo__create_database", "Create a new MongoDB database by inserting a temporary document into a collection.",
         MongoCreateDatabase,
         mongo_schema(&[
             ("database", "Database name to create", "string", true),
             ("collection", "Initial collection name", "string", true),
         ]),
         RiskLevel::Elevated, "create", &["ui"]);

    reg!("mongo__drop_database", "Drop a MongoDB database and all its collections. DESTRUCTIVE: permanently removes all data.",
         MongoDropDatabase,
         mongo_schema(&[
             ("database", "Database name to drop", "string", true),
         ]),
         RiskLevel::Destructive, "delete", &["ui"]);

    reg!("mongo__create_collection", "Create a new collection in a MongoDB database with optional settings (capped, size, max, timeseries, validator).",
         MongoCreateCollection,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name to create", "string", true),
             ("options", "Optional collection settings {capped, size, max, timeseries, validator}", "object", false),
         ]),
         RiskLevel::Elevated, "create", &["ui"]);

    reg!("mongo__drop_collection", "Drop a MongoDB collection and all its documents. DESTRUCTIVE: permanently removes data.",
         MongoDropCollection,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name to drop", "string", true),
         ]),
         RiskLevel::Destructive, "delete", &["ui"]);

    reg!("mongo__server_status", "Get MongoDB server status including host, version, uptime, connections, network, and memory usage.",
         MongoServerStatus,
         mongo_schema(&[]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("mongo__repl_set_status", "Get MongoDB replica set status including set name, members, states, and health.",
         MongoReplSetStatus,
         mongo_schema(&[]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("mongo__shard_status", "Get MongoDB sharding status including shards and mongos instances.",
         MongoShardStatus,
         mongo_schema(&[]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("mongo__count_documents", "Count documents in a MongoDB collection matching an optional filter.",
         MongoCountDocuments,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("filter", "Optional JSON filter string, e.g. {\"status\": \"active\"}", "string", false),
         ]),
         RiskLevel::Safe, "read", &["agent", "ui"]);

    reg!("mongo__update_document", "Update a single document in a MongoDB collection by its _id using $set with the provided fields.",
         MongoUpdateDocument,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("id", "Document _id value (ObjectId string or regular string)", "string", true),
             ("document", "JSON document with fields to update (will be applied as $set)", "string", true),
         ]),
         RiskLevel::Elevated, "update", &["agent", "ui"]);

    reg!("mongo__delete_document", "Delete a single document from a MongoDB collection by its _id. DESTRUCTIVE: permanently removes the document.",
         MongoDeleteDocument,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("id", "Document _id value (ObjectId string or regular string)", "string", true),
         ]),
         RiskLevel::Destructive, "delete", &["agent", "ui"]);

    reg!("mongo__rename_collection", "Rename a MongoDB collection within the same database.",
         MongoRenameCollection,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Current collection name", "string", true),
             ("to_collection", "New collection name", "string", true),
         ]),
         RiskLevel::Elevated, "update", &["ui"]);

    reg!("mongo__clone_collection", "Clone a MongoDB collection including all documents and indexes to a new collection.",
         MongoCloneCollection,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("source_collection", "Source collection to clone from", "string", true),
             ("target_collection", "Target collection to clone into", "string", true),
         ]),
         RiskLevel::Elevated, "create", &["ui"]);

    reg!("mongo__truncate_collection", "Remove all documents from a MongoDB collection while preserving the collection and indexes. DESTRUCTIVE: permanently removes all documents.",
         MongoTruncateCollection,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name to truncate", "string", true),
         ]),
         RiskLevel::Destructive, "delete", &["ui"]);

    reg!("mongo__list_indexes", "List all indexes on a MongoDB collection with their key fields and options.",
         MongoListIndexes,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
         ]),
         RiskLevel::Safe, "read", &["ui"]);

    reg!("mongo__create_index", "Create an index on a MongoDB collection with optional settings (unique, sparse, TTL).",
         MongoCreateIndex,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("keys", "Index key specification, e.g. {\"field\": 1}", "object", true),
             ("name", "Optional index name", "string", false),
             ("unique", "Whether the index should enforce uniqueness", "boolean", false),
             ("sparse", "Whether the index should only reference documents with the indexed fields", "boolean", false),
             ("expire_after_seconds", "TTL index expiration in seconds", "integer", false),
         ]),
         RiskLevel::Elevated, "create", &["ui"]);

    reg!("mongo__drop_index", "Drop an index from a MongoDB collection. Cannot drop the _id_ index.",
         MongoDropIndex,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("index_name", "Name of the index to drop", "string", true),
         ]),
         RiskLevel::Elevated, "delete", &["ui"]);

    reg!("mongo__sample_documents", "Sample documents from a MongoDB collection with a configurable limit (default 10).",
         MongoSampleDocuments,
         mongo_schema(&[
             ("database", "MongoDB database name", "string", false),
             ("collection", "Collection name", "string", true),
             ("limit", "Maximum number of documents to return (default 10, max 1000)", "integer", false),
         ]),
         RiskLevel::Safe, "read", &["ui"]);
}
