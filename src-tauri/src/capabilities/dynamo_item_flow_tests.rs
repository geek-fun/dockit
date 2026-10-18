use super::*;
use crate::dynamo::types::ApiResponse;
use aws_sdk_dynamodb::types::{
    AttributeDefinition, AttributeValue, BillingMode, KeySchemaElement, KeyType,
    ScalarAttributeType,
};
use serde_json::json;

struct LocalFactory(String);

#[async_trait::async_trait]
impl DynamoClientFactory for LocalFactory {
    async fn create_client(&self, _config: &Value) -> Result<aws_sdk_dynamodb::Client, String> {
        crate::common::dynamo::create_dynamo_client(&json!({
            "region": "us-east-1", "authKind": "accessKey", "accessKeyId": "test", "secretAccessKey": "test", "endpointUrl": self.0,
        }), None).await
    }
}

async fn mock_typed_read(server: &wiremock::MockServer, operation: &str) {
    use wiremock::matchers::{header, method, path};
    use wiremock::{Mock, ResponseTemplate};

    Mock::given(method("POST"))
        .and(path("/"))
        .and(header(
            "x-amz-target",
            format!("DynamoDB_20120810.{operation}"),
        ))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "Items": [
                {
                    "id": {"S": "first"},
                    "number": {"N": "9223372036854775808"},
                    "binary": {"B": "YQ=="},
                    "enabled": {"BOOL": false},
                    "nil": {"NULL": true},
                    "strings": {"SS": ["a", "b"]},
                    "numbers": {"NS": ["1", "9223372036854775808"]},
                    "binaries": {"BS": ["YQ==", "Yg=="]},
                    "list": {"L": [{"N": "42"}]},
                    "map": {"M": {"nested": {"BOOL": true}}},
                    "future": {"FUTURE_TYPE": "unrecognized by this SDK"}
                },
                {"id": {"S": "second"}, "strings": {"L": [{"S": "a"}]}}
            ],
            "Count": 2,
            "ScannedCount": 2,
            "LastEvaluatedKey": {"id": {"S": "second"}},
            "NextToken": "next-page"
        })))
        .expect(1)
        .mount(server)
        .await;
}

fn assert_typed_read(response: &ApiResponse) {
    assert_eq!(response.status, 200, "{}", response.message);
    let data = response.data.as_ref().unwrap();
    assert_eq!(data["count"], 2);
    assert_eq!(
        data["attribute_types"],
        json!([
            {"id": "S", "number": "N", "binary": "B", "enabled": "BOOL", "nil": "NULL",
             "strings": "SS", "numbers": "NS", "binaries": "BS", "list": "L", "map": "M", "future": "UNKNOWN"},
            {"id": "S", "strings": "L"}
        ])
    );
    assert_eq!(
        data["items"][0],
        json!({
            "id": "first", "number": 9223372036854775808u64, "binary": "YQ==", "enabled": false,
            "nil": null, "strings": ["a", "b"], "numbers": [1, 9223372036854775808u64],
            "binaries": ["YQ==", "Yg=="], "list": [42], "map": {"nested": true}, "future": null
        })
    );
    assert_eq!(data["items"][1], json!({"id": "second", "strings": ["a"]}));
}

#[tokio::test]
async fn query_response_preserves_typed_metadata_and_pagination() {
    let server = wiremock::MockServer::start().await;
    mock_typed_read(&server, "Query").await;
    let client = LocalFactory(server.uri())
        .create_client(&json!({}))
        .await
        .unwrap();
    let payload = json!({"partition_key": {"name": "id", "value": "first"}, "limit": 2});
    let response = query_table(
        &client,
        QueryTableInput {
            table_name: "qa",
            payload: &payload,
        },
    )
    .await
    .unwrap();
    assert_typed_read(&response);
    assert_eq!(
        response.data.unwrap()["last_evaluated_key"],
        json!({"id": "second"})
    );
}

#[tokio::test]
async fn scan_response_preserves_typed_metadata_and_pagination() {
    let server = wiremock::MockServer::start().await;
    mock_typed_read(&server, "Scan").await;
    let client = LocalFactory(server.uri())
        .create_client(&json!({}))
        .await
        .unwrap();
    let payload = json!({"limit": 2});
    let response = scan_table(
        &client,
        ScanTableInput {
            table_name: "qa",
            payload: &payload,
        },
    )
    .await
    .unwrap();
    assert_typed_read(&response);
    assert_eq!(
        response.data.unwrap()["last_evaluated_key"],
        json!({"id": "second"})
    );
}

#[tokio::test]
async fn partiql_response_preserves_typed_metadata_and_pagination() {
    use crate::dynamo::execute_statement::{execute_statement, ExecuteStatementInput};

    let server = wiremock::MockServer::start().await;
    mock_typed_read(&server, "ExecuteStatement").await;
    let client = LocalFactory(server.uri())
        .create_client(&json!({}))
        .await
        .unwrap();
    let response = execute_statement(
        &client,
        ExecuteStatementInput {
            statement: "SELECT * FROM qa",
            next_token: Some("previous-page"),
            limit: Some(2),
        },
    )
    .await
    .unwrap();
    assert_typed_read(&response);
    assert_eq!(response.data.unwrap()["next_token"], "next-page");
    let requests = server.received_requests().await.unwrap();
    let request: Value = serde_json::from_slice(&requests[0].body).unwrap();
    assert_eq!(request["NextToken"], "previous-page");
    assert_eq!(request["Limit"], 2);
}

#[tokio::test]
#[ignore = "requires DOCKIT_DYNAMO_QA_ENDPOINT pointing to disposable DynamoDB Local"]
async fn dynamo_local_item_flow() {
    let endpoint = std::env::var("DOCKIT_DYNAMO_QA_ENDPOINT").expect("local endpoint required");
    assert!(
        endpoint.starts_with("http://127.0.0.1:"),
        "QA must use localhost"
    );
    let client = LocalFactory(endpoint.clone())
        .create_client(&json!({}))
        .await
        .unwrap();
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let numeric = format!("dockit-qa-num-{suffix}");
    let composite = format!("dockit-qa-str-{suffix}");
    client
        .create_table()
        .table_name(&numeric)
        .billing_mode(BillingMode::PayPerRequest)
        .attribute_definitions(
            AttributeDefinition::builder()
                .attribute_name("id")
                .attribute_type(ScalarAttributeType::N)
                .build()
                .unwrap(),
        )
        .key_schema(
            KeySchemaElement::builder()
                .attribute_name("id")
                .key_type(KeyType::Hash)
                .build()
                .unwrap(),
        )
        .send()
        .await
        .unwrap();
    client
        .create_table()
        .table_name(&composite)
        .billing_mode(BillingMode::PayPerRequest)
        .attribute_definitions(
            AttributeDefinition::builder()
                .attribute_name("pk")
                .attribute_type(ScalarAttributeType::S)
                .build()
                .unwrap(),
        )
        .attribute_definitions(
            AttributeDefinition::builder()
                .attribute_name("sk")
                .attribute_type(ScalarAttributeType::N)
                .build()
                .unwrap(),
        )
        .key_schema(
            KeySchemaElement::builder()
                .attribute_name("pk")
                .key_type(KeyType::Hash)
                .build()
                .unwrap(),
        )
        .key_schema(
            KeySchemaElement::builder()
                .attribute_name("sk")
                .key_type(KeyType::Range)
                .build()
                .unwrap(),
        )
        .send()
        .await
        .unwrap();

    macro_rules! invoke {
        ($handler:ident, $args:expr) => {
            $handler::with_factory(Box::new(LocalFactory(endpoint.clone())))
                .handle(&$args, Some(&json!({})))
                .await
        };
    }
    macro_rules! call {
        ($handler:ident, $args:expr) => {{
            let raw = invoke!($handler, $args).expect("capability response");
            serde_json::from_str::<Value>(&raw).expect("JSON response")
        }};
    }
    let attributes = json!([{"key":"id","value":"42","type":"N"}]);
    for encoded in [false, true] {
        let response = call!(
            DynamoCreateItem,
            json!({ "table_name": numeric, "attributes": if encoded { json!(attributes.to_string()) } else { attributes.clone() } })
        );
        assert_eq!(response["status"], 200, "{response}");
        assert_eq!(response["data"]["created"], true);
    }
    let raw = client
        .get_item()
        .table_name(&numeric)
        .key("id", AttributeValue::N("42".into()))
        .consistent_read(true)
        .send()
        .await
        .unwrap();
    assert_eq!(raw.item().unwrap()["id"], AttributeValue::N("42".into()));
    let response = call!(
        DynamoCreateItem,
        json!({ "table_name": numeric, "attributes": attributes, "skip_existing":true, "partition_key":"id" })
    );
    assert_eq!(response["data"]["skipped"], true, "{response}");

    for (attrs, message) in [
        (
            json!([{"key":"pk","value":"a"},{"key":"sk","value":"1","type":"N"}]),
            "attribute 'pk' has no 'type'",
        ),
        (
            json!([{"key":"pk","type":"S"}]),
            "attribute 'pk' has no 'value'",
        ),
        (
            json!([{"value":"x","type":"S"}]),
            "attribute 0 has no 'key'",
        ),
    ] {
        for encoded in [false, true] {
            let response = call!(
                DynamoCreateItem,
                json!({ "table_name":composite, "attributes": if encoded { json!(attrs.to_string()) } else { attrs.clone() } })
            );
            assert_eq!(response["status"], 400, "{response}");
            assert!(
                response["message"].as_str().unwrap().contains(message),
                "{response}"
            );
        }
    }
    assert_eq!(
        client
            .scan()
            .table_name(&composite)
            .send()
            .await
            .unwrap()
            .count(),
        0
    );
    let response = call!(
        DynamoUpdateItem,
        json!({ "table_name":numeric, "keys":attributes, "attributes":[{"key":"valid","value":"no partial write","type":"S"},{"key":"bad","value":"missing type"}] })
    );
    assert_eq!(response["status"], 400);
    let raw = client
        .get_item()
        .table_name(&numeric)
        .key("id", AttributeValue::N("42".into()))
        .consistent_read(true)
        .send()
        .await
        .unwrap();
    assert!(!raw.item().unwrap().contains_key("valid"));

    for kind in ["SS", "NS", "BS"] {
        let response = call!(
            DynamoCreateItem,
            json!({"table_name":numeric,"attributes":[{"key":"id","value":"99","type":"N"},{"key":"tags","value":"[]","type":kind}]})
        );
        assert_eq!(response["status"], 400, "{response}");
        assert!(response["message"].as_str().unwrap().contains("empty sets"));
    }
    for value in ["Infinity", "NaN", "1e400", "0x10"] {
        let response = call!(
            DynamoCreateItem,
            json!({"table_name":numeric,"attributes":[{"key":"id","value":value,"type":"N"}]})
        );
        assert_eq!(response["status"], 400, "{response}");
    }
    for (value, expected) in [
        ("+5", "5"),
        (".5", "0.5"),
        ("5.", "5"),
        ("1e2", "100"),
        ("9007199254740993", "9007199254740993"),
        ("9223372036854775808", "9223372036854775808"),
    ] {
        let response = call!(
            DynamoCreateItem,
            json!({"table_name":numeric,"attributes":[{"key":"id","value":value,"type":"N"}]})
        );
        assert_eq!(response["status"], 200, "{response}");
        let raw = client
            .get_item()
            .table_name(&numeric)
            .key("id", AttributeValue::N(expected.into()))
            .consistent_read(true)
            .send()
            .await
            .unwrap();
        assert_eq!(
            raw.item().unwrap()["id"],
            AttributeValue::N(expected.into())
        );
    }
    let all_types = json!([
        {"key":"id","type":"N","value":"1000"}, {"key":"text","type":"S","value":""},
        {"key":"num","type":"N","value":"9223372036854775808"}, {"key":"flag","type":"BOOL","value":false},
        {"key":"binary","type":"B","value":"aGVsbG8="}, {"key":"nil","type":"NULL","value":null},
        {"key":"ss","type":"SS","value":"[\"a\",\"\"]"}, {"key":"ns","type":"NS","value":"[1,\"2.5\"]"},
        {"key":"bs","type":"BS","value":"[\"\"]"}, {"key":"list","type":"L","value":"[]"},
        {"key":"map","type":"M","value":"{\"nested\":{\"x\":true}}"}
    ]);
    let response = call!(
        DynamoCreateItem,
        json!({"table_name":numeric,"attributes":all_types})
    );
    assert_eq!(response["status"], 200, "{response}");
    let before = client
        .get_item()
        .table_name(&numeric)
        .key("id", AttributeValue::N("1000".into()))
        .consistent_read(true)
        .send()
        .await
        .unwrap()
        .item
        .unwrap();
    assert_eq!(
        before["ss"],
        AttributeValue::Ss(vec!["".into(), "a".into()])
    );
    assert_eq!(
        before["bs"],
        AttributeValue::Bs(vec![aws_sdk_dynamodb::primitives::Blob::new(vec![])])
    );
    let response = call!(
        DynamoExecuteQuery,
        json!({"statement":format!("SELECT * FROM \"{numeric}\" WHERE id = 1000")})
    );
    assert_eq!(response["status"], 200, "{response}");
    for (key, kind) in [
        ("ss", "SS"),
        ("ns", "NS"),
        ("bs", "BS"),
        ("binary", "B"),
        ("nil", "NULL"),
        ("map", "M"),
        ("list", "L"),
        ("num", "N"),
        ("flag", "BOOL"),
    ] {
        assert_eq!(
            response["data"]["attribute_types"][0][key], kind,
            "{response}"
        );
    }
    let response = call!(
        DynamoUpdateItem,
        json!({"table_name":numeric,"keys":[{"key":"id","type":"N","value":"1000"}],"attributes":all_types.as_array().unwrap()[1..]})
    );
    assert_eq!(response["status"], 200, "{response}");
    assert!(response["data"].is_object());
    let after = client
        .get_item()
        .table_name(&numeric)
        .key("id", AttributeValue::N("1000".into()))
        .consistent_read(true)
        .send()
        .await
        .unwrap()
        .item
        .unwrap();
    assert_eq!(before, after);

    for encoded in [false, true] {
        let base = if encoded { 2004 } else { 2001 };
        let items = json!([
            {"attributes":[{"key":"id","type":"N","value":base}]},
            {"attributes":[{"key":"id","type":"N","value":base+1}]},
            {"attributes":[{"key":"id","type":"N","value":base+2},{"key":"tags","type":"SS","value":"nope"}]}
        ]);
        let response = call!(
            DynamoBatchWriteItems,
            json!({"table_name":numeric,"items":if encoded { json!(items.to_string()) } else { items }})
        );
        assert_eq!(response["data"]["inserted"], 2, "{response}");
        assert_eq!(response["data"]["skipped"], 1, "{response}");
        assert_eq!(response["data"]["error_count"], 1, "{response}");
        assert!(response["data"]["errors"][0]["message"]
            .as_str()
            .unwrap()
            .contains("tags"));
    }
    let response = call!(
        DynamoBatchWriteItems,
        json!({"table_name":numeric,"items":[{}]})
    );
    assert_eq!(response["data"]["error_count"], 1, "{response}");
    assert!(response["data"]["errors"][0]["message"]
        .as_str()
        .unwrap()
        .contains("no attributes provided"));
    let result = invoke!(
        DynamoTransactWriteItems,
        json!({"transact_items":[
            {"op":"put","table_name":numeric,"attributes":[{"key":"id","type":"N","value":"3000"}]},
            {"op":"put","table_name":numeric,"attributes":[{"key":"x","value":"missing type"}]}
        ]})
    );
    assert!(result
        .unwrap_err()
        .contains("attribute 'x' in 'put' at index 1 has no 'type'"));
    assert!(client
        .get_item()
        .table_name(&numeric)
        .key("id", AttributeValue::N("3000".into()))
        .consistent_read(true)
        .send()
        .await
        .unwrap()
        .item()
        .is_none());
    let response = call!(
        DynamoDeleteItem,
        json!({"table_name":numeric,"keys":attributes})
    );
    assert_eq!(response["status"], 200, "{response}");
    assert!(response["data"].is_object());
    assert!(client
        .get_item()
        .table_name(&numeric)
        .key("id", AttributeValue::N("42".into()))
        .consistent_read(true)
        .send()
        .await
        .unwrap()
        .item()
        .is_none());
    client
        .delete_table()
        .table_name(numeric)
        .send()
        .await
        .unwrap();
    client
        .delete_table()
        .table_name(composite)
        .send()
        .await
        .unwrap();
}
