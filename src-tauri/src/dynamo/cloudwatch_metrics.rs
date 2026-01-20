use crate::dynamo::types::ApiResponse;
use aws_sdk_cloudwatch::types::{Dimension, Metric, MetricDataQuery, MetricStat, Statistic};
use aws_sdk_cloudwatch::Client;
use serde_json::json;
use std::time::{Duration, SystemTime};

pub struct CloudWatchInput<'a> {
    pub table_name: &'a str,
    pub period_hours: i64,
}

pub async fn get_table_metrics(
    client: &Client,
    input: CloudWatchInput<'_>,
) -> Result<ApiResponse, String> {
    let table_name = input.table_name;
    let period_hours = input.period_hours.max(1).min(168); // 1 hour to 7 days

    // Calculate time range
    let end_time = SystemTime::now();
    let start_time = end_time - Duration::from_secs((period_hours * 3600) as u64);

    // Create dimension for the table
    let table_dimension = Dimension::builder()
        .name("TableName")
        .value(table_name)
        .build();

    // Build metric queries for DynamoDB metrics
    let metrics_to_query = vec![
        ("ConsumedReadCapacityUnits", "AWS/DynamoDB", "Sum"),
        ("ConsumedWriteCapacityUnits", "AWS/DynamoDB", "Sum"),
        ("ProvisionedReadCapacityUnits", "AWS/DynamoDB", "Average"),
        ("ProvisionedWriteCapacityUnits", "AWS/DynamoDB", "Average"),
        ("ReadThrottledRequests", "AWS/DynamoDB", "Sum"),
        ("WriteThrottledRequests", "AWS/DynamoDB", "Sum"),
    ];

    let mut metric_data_queries: Vec<MetricDataQuery> = Vec::new();

    for (i, (metric_name, namespace, stat)) in metrics_to_query.iter().enumerate() {
        let statistic = match *stat {
            "Sum" => Statistic::Sum,
            "Average" => Statistic::Average,
            "Maximum" => Statistic::Maximum,
            "Minimum" => Statistic::Minimum,
            _ => Statistic::Average,
        };

        let metric = Metric::builder()
            .namespace(*namespace)
            .metric_name(*metric_name)
            .dimensions(table_dimension.clone())
            .build();

        let metric_stat = MetricStat::builder()
            .metric(metric)
            .period(300) // 5 minutes
            .stat(statistic.as_str())
            .build();

        let query = MetricDataQuery::builder()
            .id(format!("m{}", i))
            .metric_stat(metric_stat)
            .return_data(true)
            .build();

        metric_data_queries.push(query);
    }

    // Execute the query
    match client
        .get_metric_data()
        .set_metric_data_queries(Some(metric_data_queries))
        .start_time(aws_sdk_cloudwatch::primitives::DateTime::from(start_time))
        .end_time(aws_sdk_cloudwatch::primitives::DateTime::from(end_time))
        .send()
        .await
    {
        Ok(response) => {
            let metric_results = response.metric_data_results();

            // Check if we have any data
            let has_data = metric_results.iter().any(|r| !r.values().is_empty());

            if !has_data {
                return Ok(ApiResponse {
                    status: 200,
                    message: "No CloudWatch metrics available. CloudWatch may not be enabled for this table or there is no recent activity.".to_string(),
                    data: Some(json!({
                        "available": false,
                        "message": "CloudWatch metrics not available. Enable CloudWatch Contributor Insights or ensure there is recent table activity.",
                        "metrics": null
                    })),
                });
            }

            // Parse the results into a structured format
            let mut consumed_read: Vec<f64> = Vec::new();
            let mut consumed_write: Vec<f64> = Vec::new();
            let mut provisioned_read: f64 = 0.0;
            let mut provisioned_write: f64 = 0.0;
            let mut throttled_read: f64 = 0.0;
            let mut throttled_write: f64 = 0.0;
            let mut timestamps: Vec<String> = Vec::new();

            for result in metric_results {
                let id = result.id().unwrap_or("");
                let values = result.values();
                let result_timestamps = result.timestamps();

                match id {
                    "m0" => {
                        // ConsumedReadCapacityUnits
                        consumed_read = values.to_vec();
                        if timestamps.is_empty() {
                            timestamps = result_timestamps
                                .iter()
                                .map(|t| t.to_string())
                                .collect();
                        }
                    }
                    "m1" => {
                        // ConsumedWriteCapacityUnits
                        consumed_write = values.to_vec();
                    }
                    "m2" => {
                        // ProvisionedReadCapacityUnits
                        provisioned_read = values.first().copied().unwrap_or(0.0);
                    }
                    "m3" => {
                        // ProvisionedWriteCapacityUnits
                        provisioned_write = values.first().copied().unwrap_or(0.0);
                    }
                    "m4" => {
                        // ReadThrottledRequests
                        throttled_read = values.iter().sum();
                    }
                    "m5" => {
                        // WriteThrottledRequests
                        throttled_write = values.iter().sum();
                    }
                    _ => {}
                }
            }

            // Calculate utilization percentages
            let total_consumed_read: f64 = consumed_read.iter().sum();
            let total_consumed_write: f64 = consumed_write.iter().sum();

            let data_points = consumed_read.len().max(1) as f64;
            let avg_consumed_read = total_consumed_read / data_points;
            let avg_consumed_write = total_consumed_write / data_points;

            let rcu_utilization = if provisioned_read > 0.0 {
                ((avg_consumed_read / 300.0) / provisioned_read * 100.0).min(100.0)
            } else {
                0.0
            };

            let wcu_utilization = if provisioned_write > 0.0 {
                ((avg_consumed_write / 300.0) / provisioned_write * 100.0).min(100.0)
            } else {
                0.0
            };

            Ok(ApiResponse {
                status: 200,
                message: "CloudWatch metrics retrieved successfully".to_string(),
                data: Some(json!({
                    "available": true,
                    "metrics": {
                        "consumedRead": consumed_read,
                        "consumedWrite": consumed_write,
                        "timestamps": timestamps,
                        "provisionedReadCapacity": provisioned_read,
                        "provisionedWriteCapacity": provisioned_write,
                        "rcuUtilization": rcu_utilization.round() as i32,
                        "wcuUtilization": wcu_utilization.round() as i32,
                        "throttledReadRequests": throttled_read as i64,
                        "throttledWriteRequests": throttled_write as i64,
                        "totalThrottledEvents": (throttled_read + throttled_write) as i64
                    }
                })),
            })
        }
        Err(e) => {
            let error_message = format!("{}", e);

            // Check if it's an access denied or not enabled error
            if error_message.contains("AccessDenied")
                || error_message.contains("not authorized")
                || error_message.contains("UnauthorizedAccess")
            {
                return Ok(ApiResponse {
                    status: 200,
                    message: "CloudWatch access not available".to_string(),
                    data: Some(json!({
                        "available": false,
                        "message": "CloudWatch metrics access denied. Please ensure your IAM credentials have cloudwatch:GetMetricData permission.",
                        "metrics": null
                    })),
                });
            }

            Ok(ApiResponse {
                status: 500,
                message: format!("Failed to get CloudWatch metrics: {}", e),
                data: Some(json!({
                    "available": false,
                    "message": format!("Error retrieving metrics: {}", e),
                    "metrics": null
                })),
            })
        }
    }
}
