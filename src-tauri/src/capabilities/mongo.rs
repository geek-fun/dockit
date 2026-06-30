use std::sync::Arc;

use futures::TryStreamExt;
use mongodb::bson::{doc, oid::ObjectId, Bson, Document};
use serde_json::Value;

use crate::common::response::ApiResponse;

use super::registry::CapabilityRegistry;
use super::types::{Capability, CapabilityHandler, RiskLevel, SourceKind};

// ---------------------------------------------------------------------------
// Mongo client factory abstraction (testable via mockall)
// ---------------------------------------------------------------------------

#[cfg_attr(test, mockall::automock)]
#[async_trait::async_trait]
pub(crate) trait MongoClientFactory: Send + Sync {
    async fn create_client(&self, config: &Value) -> Result<(mongodb::Client, String), String>;
}

pub(crate) struct RealMongoClientFactory;

#[async_trait::async_trait]
impl MongoClientFactory for RealMongoClientFactory {
    async fn create_client(&self, config: &Value) -> Result<(mongodb::Client, String), String> {
        crate::common::mongo::create_mongo_client_from_config(config).await
    }
}

// ---------------------------------------------------------------------------
// MongoDB capability handlers
// ---------------------------------------------------------------------------

pub(crate) struct MongoListDatabases {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoListDatabases {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoListCollections {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoListCollections {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoFind {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoFind {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoAggregate {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoAggregate {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoInsertOne {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoInsertOne {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoUpdateMany {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoUpdateMany {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoDeleteMany {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoDeleteMany {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoCollectionStats {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoCollectionStats {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoDatabaseStats {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoDatabaseStats {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoCreateDatabase {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoCreateDatabase {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoDropDatabase {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoDropDatabase {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoCreateCollection {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoCreateCollection {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoDropCollection {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoDropCollection {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoServerStatus {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoServerStatus {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoReplSetStatus {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoReplSetStatus {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoShardStatus {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoShardStatus {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoCountDocuments {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoCountDocuments {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoUpdateDocument {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoUpdateDocument {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoDeleteDocument {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoDeleteDocument {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoRenameCollection {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoRenameCollection {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoCloneCollection {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoCloneCollection {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoTruncateCollection {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoTruncateCollection {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoListIndexes {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoListIndexes {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoCreateIndex {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoCreateIndex {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoDropIndex {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoDropIndex {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

pub(crate) struct MongoSampleDocuments {
    factory: Box<dyn MongoClientFactory>,
}

impl MongoSampleDocuments {
    pub(crate) fn new() -> Self {
        Self { factory: Box::new(RealMongoClientFactory) }
    }

    #[cfg(test)]
    pub(crate) fn with_factory(factory: Box<dyn MongoClientFactory>) -> Self {
        Self { factory }
    }
}

#[async_trait::async_trait]
impl CapabilityHandler for MongoListDatabases {
    async fn handle(
        &self,
        _args: &Value,
        connection_config: Option<&Value>,
    ) -> Result<String, String> {
        let config = connection_config.ok_or_else(|| "MongoDB requires a connection config".to_string())?;
        let (client, _) = self.factory.create_client(config).await?;
        let names = client
            .list_database_names()
            .await
            .map_err(|e| format!("Failed to list databases: {}", e))?;
        let data = serde_json::json!({ "databases": names });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
        let db_name = get_db_name(args, config)?;
        let db = client.database(&db_name);
        let names = db
            .list_collection_names()
            .await
            .map_err(|e| format!("Failed to list collections: {}", e))?;
        let data = serde_json::json!({ "collections": names });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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
        let data = serde_json::json!({ "count": docs.len(), "documents": docs });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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
        let data = serde_json::json!({ "count": docs.len(), "documents": docs });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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
        let data = serde_json::json!({ "inserted_id": inserted_id });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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
        let data = serde_json::json!({
            "matched_count": update_result.matched_count,
            "modified_count": update_result.modified_count,
            "upserted_id": update_result.upserted_id.map(|id| {
                crate::common::bson::bson_to_value(&id)
            })
        });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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
        let data = serde_json::json!({
            "deleted_count": delete_result.deleted_count,
        });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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
            "avg_obj_size": result.get_f64("avgObjSize").ok(),
            "storage_size": get_num(&result, "storageSize"),
            "nindexes": get_num(&result, "nindexes"),
            "total_index_size": get_num(&result, "totalIndexSize"),
            "index_sizes": index_sizes,
            "capped": result.get_bool("capped").ok(),
            "max": result.get_i64("max").ok(),
            "max_size": result.get_i64("maxSize").ok(),
        });

        let data = serde_json::json!({ "stats": stats });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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
            "avg_obj_size": result.get_f64("avgObjSize").ok(),
            "data_size": get_num(&result, "dataSize"),
            "storage_size": get_num(&result, "storageSize"),
            "indexes": get_num(&result, "indexes"),
            "index_size": get_num(&result, "indexSize"),
            "total_size": get_num(&result, "totalSize"),
            "scale_factor": result.get_i32("scaleFactor").ok().map(|v| v as i64),
        });

        let data = serde_json::json!({ "stats": stats, "version": version });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({ "message": format!("Database '{}' created successfully", db_name) });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
        let db_name = args
            .get("database")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or("Missing database")?;

        client.database(db_name)
            .drop()
            .await
            .map_err(|e| format!("Failed to drop database: {}", e))?;

        let data = serde_json::json!({ "message": format!("Database '{}' dropped successfully", db_name) });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({ "message": format!("Collection '{}' created successfully", collection_name) });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({ "message": format!("Collection '{}' dropped successfully", collection_name) });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({ "status": status });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
        let admin_db = client.database("admin");

        let result = match admin_db.run_command(doc! { "replSetGetStatus": 1 }).await {
            Ok(r) => r,
            Err(e) => {
                return Ok(ApiResponse::<serde_json::Value>::err(400, format!("Not a replica set or error: {}", e)).into_string());
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

        let data = serde_json::json!({ "status": status });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
        let admin_db = client.database("admin");

        let is_sharding = admin_db.run_command(doc! { "shardingState": 1 }).await.is_ok();

        if !is_sharding {
            let data = serde_json::json!({
                "cluster": { "is_sharding_enabled": false, "shards": [], "mongos": [] }
            });
            return Ok(ApiResponse::json(data).into_string());
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

        let data = serde_json::json!({
            "cluster": {
                "is_sharding_enabled": true,
                "shards": shards,
                "mongos": mongos,
            }
        });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({ "count": count });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        if result.matched_count > 0 {
            let data = serde_json::json!({
                "matched_count": result.matched_count,
                "modified_count": result.modified_count,
            });
            Ok(ApiResponse::json(data).into_string())
        } else {
            Ok(ApiResponse::<serde_json::Value>::err(404, "No document matched the given id").into_string())
        }
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
        let (client, _) = self.factory.create_client(config).await?;
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

        if result.deleted_count > 0 {
            let data = serde_json::json!({
                "deleted_count": result.deleted_count,
            });
            Ok(ApiResponse::json(data).into_string())
        } else {
            Ok(ApiResponse::<serde_json::Value>::err(404, "No document matched the given id").into_string())
        }
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({
            "message": format!("Collection '{}' renamed to '{}'", collection_name, to_collection),
        });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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
            return Ok(ApiResponse::<serde_json::Value>::err(404, format!("Source collection '{}' does not exist", source_coll)).into_string());
        }
        if names.contains(&target_coll.to_string()) {
            return Ok(ApiResponse::<serde_json::Value>::err(409, format!("Target collection '{}' already exists", target_coll)).into_string());
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
        } else {
            // Create empty collection explicitly — when there are no documents
            // and no non-_id_ indexes, nothing else would trigger creation
            db.create_collection(target_coll)
                .await
                .map_err(|e| format!("Failed to create target collection: {}", e))?;
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

        let data = serde_json::json!({
            "documents_copied": doc_count,
            "indexes_copied": index_count,
        });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({
            "deleted_count": result.deleted_count,
        });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({ "indexes": indexes });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({ "index_name": result.index_name });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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
            return Ok(ApiResponse::<serde_json::Value>::err(400, "Cannot drop the default _id_ index").into_string());
        }

        client
            .database(&db_name)
            .collection::<Document>(collection_name)
            .drop_index(index_name)
            .await
            .map_err(|e| format!("drop_index failed: {}", e))?;

        let data = serde_json::json!({
            "message": format!("Index '{}' dropped successfully", index_name),
        });
        Ok(ApiResponse::json(data).into_string())
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
        let (client, _) = self.factory.create_client(config).await?;
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

        let data = serde_json::json!({ "documents": docs, "count": docs.len() });
        Ok(ApiResponse::json(data).into_string())
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
        ($name:expr, $desc:expr, $handler:expr, $schema:expr, $risk:expr, $perm:expr, $tags:expr, $parallel_ok:expr) => {
            registry.register(Capability {
                name: $name,
                description: $desc,
                handler: Arc::new($handler),
                input_schema: $schema,
                risk_level: $risk,
                required_permission: $perm,
                source_kind: SourceKind::Database("MONGODB"),
                tags: $tags,
                parallel_ok: $parallel_ok,
            });
        };
        ($name:expr, $desc:expr, $handler:expr, $schema:expr, $risk:expr, $perm:expr, $tags:expr) => {
            reg!($name, $desc, $handler, $schema, $risk, $perm, $tags, false)
        };
    }

     reg!("mongo__list_databases", "List all database names on a MongoDB server. Use this first when no database is known so you can pick one for subsequent calls.",
          MongoListDatabases::new(),
          mongo_schema(&[]),
          RiskLevel::Safe, "read", &["agent", "ui"]);

     reg!("mongo__list_collections", "List all collection names in a MongoDB database.",
          MongoListCollections::new(),
          mongo_schema(&[("database", "MongoDB database name", "string", false)]),
          RiskLevel::Safe, "read", &["agent", "ui"]);

     reg!("mongo__find", "Query documents from a MongoDB collection using a filter. Returns matching documents.",
          MongoFind::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name to query", "string", true),
              ("filter", "MongoDB query filter, e.g. {\"status\": \"active\"}", "object", true),
              ("projection", "Optional fields to include/exclude", "object", false),
              ("limit", "Maximum documents to return (default 20, max 100)", "integer", false),
              ("sort", "Optional sort specification", "object", false),
          ]),
          RiskLevel::Safe, "read", &["agent", "ui"], true);

     reg!("mongo__aggregate", "Execute a MongoDB aggregation pipeline on a collection.",
          MongoAggregate::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
              ("pipeline", "Aggregation pipeline stages as array", "array", true),
          ]),
           RiskLevel::Elevated, "read", &["agent"], false);

     reg!("mongo__insert_one", "Insert a single document into a MongoDB collection.",
          MongoInsertOne::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
              ("document", "Document to insert", "object", true),
          ]),
          RiskLevel::Elevated, "create", &["agent", "ui"]);

     reg!("mongo__update_many", "Update documents in a MongoDB collection matching a filter.",
          MongoUpdateMany::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
              ("filter", "Filter to match documents to update", "object", true),
              ("update", "Update operations, e.g. {\"$set\": {\"status\": \"inactive\"}}", "object", true),
              ("upsert", "If true, insert if none matches (default false)", "boolean", false),
          ]),
          RiskLevel::Elevated, "update", &["agent"]);

     reg!("mongo__delete_many", "Delete documents from a MongoDB collection matching a filter. DESTRUCTIVE: permanently removes data.",
          MongoDeleteMany::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
              ("filter", "Filter to match documents to delete", "object", true),
          ]),
          RiskLevel::Destructive, "delete", &["agent", "ui"]);

     reg!("mongo__collection_stats", "Get detailed statistics for a MongoDB collection including document count, storage size, and index sizes.",
          MongoCollectionStats::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
          ]),
          RiskLevel::Safe, "read", &["ui"]);

     reg!("mongo__database_stats", "Get statistics for a MongoDB database including collection count, object count, and storage metrics.",
          MongoDatabaseStats::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
          ]),
          RiskLevel::Safe, "read", &["ui"]);

     reg!("mongo__create_database", "Create a new MongoDB database by inserting a temporary document into a collection.",
          MongoCreateDatabase::new(),
          mongo_schema(&[
              ("database", "Database name to create", "string", true),
              ("collection", "Initial collection name", "string", true),
          ]),
          RiskLevel::Elevated, "create", &["ui"]);

     reg!("mongo__drop_database", "Drop a MongoDB database and all its collections. DESTRUCTIVE: permanently removes all data.",
          MongoDropDatabase::new(),
          mongo_schema(&[
              ("database", "Database name to drop", "string", true),
          ]),
          RiskLevel::Destructive, "delete", &["ui"]);

     reg!("mongo__create_collection", "Create a new collection in a MongoDB database with optional settings (capped, size, max, timeseries, validator).",
          MongoCreateCollection::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name to create", "string", true),
              ("options", "Optional collection settings {capped, size, max, timeseries, validator}", "object", false),
          ]),
          RiskLevel::Elevated, "create", &["ui"]);

     reg!("mongo__drop_collection", "Drop a MongoDB collection and all its documents. DESTRUCTIVE: permanently removes data.",
          MongoDropCollection::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name to drop", "string", true),
          ]),
          RiskLevel::Destructive, "delete", &["ui"]);

     reg!("mongo__server_status", "Get MongoDB server status including host, version, uptime, connections, network, and memory usage.",
          MongoServerStatus::new(),
          mongo_schema(&[]),
          RiskLevel::Safe, "read", &["ui"]);

     reg!("mongo__repl_set_status", "Get MongoDB replica set status including set name, members, states, and health.",
          MongoReplSetStatus::new(),
          mongo_schema(&[]),
          RiskLevel::Safe, "read", &["ui"]);

     reg!("mongo__shard_status", "Get MongoDB sharding status including shards and mongos instances.",
          MongoShardStatus::new(),
          mongo_schema(&[]),
          RiskLevel::Safe, "read", &["ui"]);

     reg!("mongo__count_documents", "Count documents in a MongoDB collection matching an optional filter.",
          MongoCountDocuments::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
              ("filter", "Optional JSON filter string, e.g. {\"status\": \"active\"}", "string", false),
          ]),
          RiskLevel::Safe, "read", &["agent", "ui"], true);

     reg!("mongo__update_document", "Update a single document in a MongoDB collection by its _id using $set with the provided fields.",
          MongoUpdateDocument::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
              ("id", "Document _id value (ObjectId string or regular string)", "string", true),
              ("document", "JSON document with fields to update (will be applied as $set)", "string", true),
          ]),
          RiskLevel::Elevated, "update", &["agent", "ui"]);

     reg!("mongo__delete_document", "Delete a single document from a MongoDB collection by its _id. DESTRUCTIVE: permanently removes the document.",
          MongoDeleteDocument::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
              ("id", "Document _id value (ObjectId string or regular string)", "string", true),
          ]),
          RiskLevel::Destructive, "delete", &["agent", "ui"]);

     reg!("mongo__rename_collection", "Rename a MongoDB collection within the same database.",
          MongoRenameCollection::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Current collection name", "string", true),
              ("to_collection", "New collection name", "string", true),
          ]),
          RiskLevel::Elevated, "update", &["ui"]);

     reg!("mongo__clone_collection", "Clone a MongoDB collection including all documents and indexes to a new collection.",
          MongoCloneCollection::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("source_collection", "Source collection to clone from", "string", true),
              ("target_collection", "Target collection to clone into", "string", true),
          ]),
          RiskLevel::Elevated, "create", &["ui"]);

     reg!("mongo__truncate_collection", "Remove all documents from a MongoDB collection while preserving the collection and indexes. DESTRUCTIVE: permanently removes all documents.",
          MongoTruncateCollection::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name to truncate", "string", true),
          ]),
          RiskLevel::Destructive, "delete", &["ui"]);

     reg!("mongo__list_indexes", "List all indexes on a MongoDB collection with their key fields and options.",
          MongoListIndexes::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
          ]),
          RiskLevel::Safe, "read", &["ui"]);

     reg!("mongo__create_index", "Create an index on a MongoDB collection with optional settings (unique, sparse, TTL).",
          MongoCreateIndex::new(),
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
          MongoDropIndex::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
              ("index_name", "Name of the index to drop", "string", true),
          ]),
          RiskLevel::Elevated, "delete", &["ui"]);

      reg!("mongo__sample_documents", "Sample documents from a MongoDB collection with a configurable limit (default 10).",
          MongoSampleDocuments::new(),
          mongo_schema(&[
              ("database", "MongoDB database name", "string", false),
              ("collection", "Collection name", "string", true),
              ("limit", "Maximum number of documents to return (default 10, max 1000)", "integer", false),
          ]),
          RiskLevel::Safe, "read", &["ui"], true);
}

#[cfg(test)]
mod tests {
    use super::*;
    
    use serde_json::json;

    fn mock_config() -> Value {
        json!({"host": "localhost", "port": 27017, "database": "testdb"})
    }

    fn lazy_client() -> mongodb::Client {
        mongodb::Client::with_options(mongodb::options::ClientOptions::default())
            .expect("build lazy client")
    }

    fn err_factory() -> MockMongoClientFactory {
        let mut m = MockMongoClientFactory::new();
        m.expect_create_client()
            .return_once(|_| Err("factory error".to_string()));
        m
    }

    fn ok_factory(client: mongodb::Client) -> MockMongoClientFactory {
        let mut m = MockMongoClientFactory::new();
        m.expect_create_client()
            .return_once(move |_| Ok((client, "testdb".to_string())));
        m
    }

    #[tokio::test]
    async fn test_mongo_list_databases_missing_config() {
        let handler = MongoListDatabases::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err(), "expected Err, got Ok");
        assert!(
            result.unwrap_err().contains("connection config"),
            "should mention connection config"
        );
    }

    #[tokio::test]
    async fn test_mongo_list_collections_missing_config() {
        let handler = MongoListCollections::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_mongo_database_stats_missing_config() {
        let handler = MongoDatabaseStats::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_mongo_list_collections_missing_database() {
        let handler = MongoListCollections::with_factory(Box::new(err_factory()));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(
            result.unwrap_err().contains("factory error"),
            "should propagate factory error, not arg error"
        );
    }

    #[tokio::test]
    async fn test_mongo_find_missing_collection() {
        let cl = lazy_client();
        let handler = MongoFind::with_factory(Box::new(ok_factory(cl)));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_aggregate_missing_collection() {
        let cl = lazy_client();
        let handler = MongoAggregate::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(
                &json!({"pipeline": [{"$match": {}}]}),
                Some(&mock_config()),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_collection_stats_missing_collection() {
        let cl = lazy_client();
        let handler = MongoCollectionStats::with_factory(Box::new(ok_factory(cl)));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_update_many_missing_filter() {
        let cl = lazy_client();
        let handler = MongoUpdateMany::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(
                &json!({"collection": "c", "update": {"$set": {"a": 1}}}),
                Some(&mock_config()),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing filter"));
    }

    #[tokio::test]
    async fn test_mongo_delete_many_missing_filter() {
        let cl = lazy_client();
        let handler = MongoDeleteMany::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing filter"));
    }

    #[tokio::test]
    async fn test_mongo_insert_one_missing_document() {
        let cl = lazy_client();
        let handler = MongoInsertOne::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing document"));
    }

    #[tokio::test]
    async fn test_mongo_find_missing_filter() {
        let handler = MongoFind::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(&json!({"collection": "test"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("factory error"),
            "should propagate factory error (filter is optional), got: {}",
            err
        );
    }

    #[tokio::test]
    async fn test_mongo_aggregate_invalid_pipeline() {
        let cl = lazy_client();
        let handler = MongoAggregate::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(
                &json!({"collection": "c", "pipeline": "not_an_array"}),
                Some(&mock_config()),
            )
            .await;
        assert!(result.is_err());
        assert!(
            result.unwrap_err().contains("Missing or invalid pipeline"),
            "should reject non-array pipeline"
        );
    }

    #[tokio::test]
    async fn test_mongo_list_databases_factory_error() {
        let handler = MongoListDatabases::with_factory(Box::new(err_factory()));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_find_factory_error() {
        let handler = MongoFind::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(&json!({"collection": "c", "filter": {}}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_insert_one_factory_error() {
        let handler = MongoInsertOne::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(
                &json!({"collection": "c", "document": {"x": 1}}),
                Some(&mock_config()),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_collection_stats_factory_error() {
        let handler = MongoCollectionStats::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_database_stats_factory_error() {
        let handler = MongoDatabaseStats::with_factory(Box::new(err_factory()));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_update_many_factory_error() {
        let handler = MongoUpdateMany::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(
                &json!({"collection": "c", "filter": {}, "update": {"$set": {"a": 1}}}),
                Some(&mock_config()),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_update_many_missing_update() {
        let cl = lazy_client();
        let handler = MongoUpdateMany::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"collection": "c", "filter": {}}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing update"));
    }

    #[tokio::test]
    async fn test_mongo_server_status_missing_config() {
        let handler = MongoServerStatus::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_mongo_server_status_factory_error() {
        let handler = MongoServerStatus::with_factory(Box::new(err_factory()));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_create_collection_missing_collection() {
        let cl = lazy_client();
        let handler = MongoCreateCollection::with_factory(Box::new(ok_factory(cl)));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_create_collection_factory_error() {
        let handler = MongoCreateCollection::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_create_index_missing_keys() {
        let cl = lazy_client();
        let handler = MongoCreateIndex::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing keys"));
    }

    #[tokio::test]
    async fn test_mongo_create_index_factory_error() {
        let handler = MongoCreateIndex::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(
                &json!({"collection": "c", "keys": {"field": 1}}),
                Some(&mock_config()),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_delete_many_missing_collection() {
        let cl = lazy_client();
        let handler = MongoDeleteMany::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"filter": {}}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_delete_many_factory_error() {
        let handler = MongoDeleteMany::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(&json!({"collection": "c", "filter": {}}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_count_documents_missing_collection() {
        let cl = lazy_client();
        let handler = MongoCountDocuments::with_factory(Box::new(ok_factory(cl)));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_count_documents_factory_error() {
        let handler = MongoCountDocuments::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_update_document_missing_id() {
        let cl = lazy_client();
        let handler = MongoUpdateDocument::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(
                &json!({"collection": "c", "document": "{}"}),
                Some(&mock_config()),
            )
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing id"));
    }

    #[tokio::test]
    async fn test_mongo_update_document_missing_document() {
        let cl = lazy_client();
        let handler = MongoUpdateDocument::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"collection": "c", "id": "abc123"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing document"));
    }

    #[tokio::test]
    async fn test_mongo_delete_document_missing_id() {
        let cl = lazy_client();
        let handler = MongoDeleteDocument::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing id"));
    }

    #[tokio::test]
    async fn test_mongo_drop_database_missing_database() {
        let cl = lazy_client();
        let handler = MongoDropDatabase::with_factory(Box::new(ok_factory(cl)));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing database"));
    }

    #[tokio::test]
    async fn test_mongo_rename_collection_missing_to() {
        let cl = lazy_client();
        let handler = MongoRenameCollection::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing to_collection"));
    }

    #[tokio::test]
    async fn test_mongo_clone_collection_missing_source() {
        let cl = lazy_client();
        let handler = MongoCloneCollection::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"target_collection": "t"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing source_collection"));
    }

    #[tokio::test]
    async fn test_mongo_drop_index_missing_index_name() {
        let cl = lazy_client();
        let handler = MongoDropIndex::with_factory(Box::new(ok_factory(cl)));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing index_name"));
    }

    #[tokio::test]
    async fn test_mongo_sample_documents_missing_collection() {
        let cl = lazy_client();
        let handler = MongoSampleDocuments::with_factory(Box::new(ok_factory(cl)));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_sample_documents_factory_error() {
        let handler = MongoSampleDocuments::with_factory(Box::new(err_factory()));
        let result = handler
            .handle(&json!({"collection": "c"}), Some(&mock_config()))
            .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_truncate_collection_missing_collection() {
        let cl = lazy_client();
        let handler = MongoTruncateCollection::with_factory(Box::new(ok_factory(cl)));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_list_indexes_missing_collection() {
        let cl = lazy_client();
        let handler = MongoListIndexes::with_factory(Box::new(ok_factory(cl)));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_shard_status_missing_config() {
        let handler = MongoShardStatus::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_mongo_shard_status_factory_error() {
        let handler = MongoShardStatus::with_factory(Box::new(err_factory()));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    // ── Untested handler coverage ──────────────────────────────────────────

    #[tokio::test]
    async fn test_mongo_create_database_missing_config() {
        let handler = MongoCreateDatabase::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_mongo_create_database_missing_database() {
        let handler = MongoCreateDatabase::new();
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing database"));
    }

    #[tokio::test]
    async fn test_mongo_drop_collection_missing_config() {
        let handler = MongoDropCollection::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_mongo_drop_collection_missing_collection() {
        let handler = MongoDropCollection::new();
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing collection"));
    }

    #[tokio::test]
    async fn test_mongo_repl_set_status_missing_config() {
        let handler = MongoReplSetStatus::new();
        let result = handler.handle(&json!({}), None).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("connection config"));
    }

    #[tokio::test]
    async fn test_mongo_create_database_factory_error() {
        let handler = MongoCreateDatabase::with_factory(Box::new(err_factory()));
        let result = handler.handle(
            &json!({"database": "testdb", "collection": "testcol"}),
            Some(&mock_config()),
        )
        .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_drop_collection_factory_error() {
        let handler = MongoDropCollection::with_factory(Box::new(err_factory()));
        let result = handler.handle(
            &json!({"collection": "testcol"}),
            Some(&mock_config()),
        )
        .await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }

    #[tokio::test]
    async fn test_mongo_repl_set_status_factory_error() {
        let handler = MongoReplSetStatus::with_factory(Box::new(err_factory()));
        let result = handler.handle(&json!({}), Some(&mock_config())).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("factory error"));
    }
}
