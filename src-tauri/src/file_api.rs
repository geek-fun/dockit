use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;
use tauri::Emitter;

#[derive(Debug, serde::Deserialize)]
pub struct StreamFileInput {
    pub file_path: String,
    pub batch_size: usize,
    pub format: String,
}

#[derive(Debug, serde::Serialize, Clone)]
pub struct FileBatchResult {
    pub lines: Vec<String>,
    pub batch_number: usize,
    pub total_lines_estimate: usize,
    pub is_last_batch: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct FileInfoResult {
    pub total_lines: usize,
    pub file_size_bytes: u64,
    pub estimated_batches: usize,
}

#[tauri::command]
pub async fn get_file_info(file_path: String) -> Result<FileInfoResult, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    let file = File::open(path).map_err(|e| e.to_string())?;
    let file_size = file.metadata().map_err(|e| e.to_string())?.len();

    let reader = BufReader::new(file);
    let total_lines = reader.lines().count();

    let estimated_batches = if total_lines > 0 {
        (total_lines / 1000) + 1
    } else {
        0
    };

    Ok(FileInfoResult {
        total_lines,
        file_size_bytes: file_size,
        estimated_batches,
    })
}

#[tauri::command]
pub async fn read_file_batch(
    file_path: String,
    start_line: usize,
    batch_size: usize,
) -> Result<FileBatchResult, String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    let lines: Vec<String> = reader
        .lines()
        .skip(start_line)
        .take(batch_size)
        .filter_map(|line| line.ok())
        .collect();

    let lines_count = lines.len();
    let is_last_batch = lines_count < batch_size;

    Ok(FileBatchResult {
        lines,
        batch_number: start_line / batch_size,
        total_lines_estimate: start_line + lines_count,
        is_last_batch,
    })
}

#[tauri::command]
pub async fn stream_file_lines(
    app: tauri::AppHandle,
    file_path: String,
    batch_size: usize,
    event_name: String,
) -> Result<(), String> {
    let path = Path::new(&file_path);

    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    let mut batch_number = 0;
    let mut batch: Vec<String> = Vec::with_capacity(batch_size);

    for line_result in reader.lines() {
        match line_result {
            Ok(line) => {
                if !line.trim().is_empty() {
                    batch.push(line);

                    if batch.len() >= batch_size {
                        app.emit(&event_name, FileBatchResult {
                            lines: batch.clone(),
                            batch_number,
                            total_lines_estimate: 0,
                            is_last_batch: false,
                        }).map_err(|e: tauri::Error| e.to_string())?;

                        batch.clear();
                        batch_number += 1;
                    }
                }
            }
            Err(e) => {
                return Err(e.to_string());
            }
        }
    }

    if !batch.is_empty() {
        app.emit(&event_name, FileBatchResult {
            lines: batch,
            batch_number,
            total_lines_estimate: 0,
            is_last_batch: true,
        }).map_err(|e: tauri::Error| e.to_string())?;
    }

    Ok(())
}