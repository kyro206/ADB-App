use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use tauri::{async_runtime, AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

use crate::commands::operations::{
    install_application_packages, pull_file, run_device_action, AppInstallOptions,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationJob {
    pub id: String,
    pub r#type: String, // "upload" | "download" | "install"
    pub name: String,
    pub source: String,
    pub destination: Option<String>,
    pub is_directory: bool,
    pub status: String, // "idle" | "transferring" | "installing" | "success" | "error"
    pub error: Option<String>,
    pub children: Option<Vec<OperationJob>>,
    #[serde(default)]
    pub serial: String,
}

#[derive(Default)]
pub struct JobQueueState(pub Arc<Mutex<Vec<OperationJob>>>);

#[tauri::command]
pub async fn get_jobs(state: State<'_, JobQueueState>) -> Result<Vec<OperationJob>, String> {
    let queue = state.0.lock().await;
    Ok(queue.clone())
}

#[tauri::command]
pub async fn enqueue_job(
    app: AppHandle,
    state: State<'_, JobQueueState>,
    job: OperationJob,
) -> Result<(), String> {
    let mut queue = state.0.lock().await;
    queue.push(job);
    let _ = app.emit("operations-update", queue.clone());
    Ok(())
}

#[tauri::command]
pub async fn clear_completed_jobs(
    app: AppHandle,
    state: State<'_, JobQueueState>,
) -> Result<(), String> {
    let mut queue = state.0.lock().await;
    queue.retain(|j| j.status != "success");
    let _ = app.emit("operations-update", queue.clone());
    Ok(())
}

#[tauri::command]
pub async fn retry_job(
    app: AppHandle,
    state: State<'_, JobQueueState>,
    id: String,
    parent_id: Option<String>,
) -> Result<(), String> {
    let mut queue = state.0.lock().await;
    if let Some(pid) = parent_id {
        if let Some(parent) = queue.iter_mut().find(|j| j.id == pid) {
            if let Some(children) = &mut parent.children {
                if let Some(child_index) = children.iter().position(|c| c.id == id) {
                    let mut child = children.remove(child_index);
                    child.status = "idle".to_string();
                    child.error = None;
                    queue.push(child);
                }
            }
        }
    } else {
        if let Some(job) = queue.iter_mut().find(|j| j.id == id) {
            job.status = "idle".to_string();
            job.error = None;
        }
    }
    let _ = app.emit("operations-update", queue.clone());
    Ok(())
}

#[tauri::command]
pub async fn remove_job(
    app: AppHandle,
    state: State<'_, JobQueueState>,
    id: String,
    parent_id: Option<String>,
) -> Result<(), String> {
    let mut queue = state.0.lock().await;
    if let Some(pid) = parent_id {
        if let Some(parent) = queue.iter_mut().find(|j| j.id == pid) {
            if let Some(children) = &mut parent.children {
                children.retain(|c| c.id != id);
            }
        }
    } else {
        queue.retain(|j| j.id != id);
    }
    let _ = app.emit("operations-update", queue.clone());
    Ok(())
}

pub fn start_job_processor(app: AppHandle) {
    let state = app.state::<JobQueueState>();
    let queue_arc = state.0.clone();

    async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            let mut active_job = None;
            {
                let mut queue = queue_arc.lock().await;

                // If any job is already transferring/installing, skip processing new jobs
                if queue
                    .iter()
                    .any(|j| j.status == "transferring" || j.status == "installing")
                {
                    continue;
                }

                // Find next idle job
                if let Some(index) = queue.iter().position(|j| j.status == "idle") {
                    let job = &mut queue[index];
                    job.status = if job.r#type == "install" {
                        "installing".to_string()
                    } else {
                        "transferring".to_string()
                    };
                    job.error = None;
                    job.children = None;
                    active_job = Some(job.clone());
                    let _ = app.emit("operations-update", queue.clone());
                }
            }

            if let Some(job) = active_job {
                let serial = job.serial.clone();
                if serial.is_empty() {
                    finish_job(
                        &queue_arc,
                        &app,
                        &job.id,
                        Err("No device connected".to_string()),
                    )
                    .await;
                    continue;
                }

                let result = match job.r#type.as_str() {
                    "upload" => {
                        let args = vec![
                            "push".to_string(),
                            "--sync".to_string(),
                            job.source.clone(),
                            job.destination.clone().unwrap_or_default(),
                        ];
                        run_device_action(serial.clone(), args).await
                    }
                    "download" => {
                        pull_file(
                            serial.clone(),
                            job.source.clone(),
                            job.destination.clone().unwrap_or_default(),
                        )
                        .await
                    }
                    "install" => {
                        let mut install_options = AppInstallOptions {
                            replace_existing: false,
                            grant_runtime_permissions: false,
                            bypass_low_target_sdk_block: false,
                        };
                        if let Some(dest) = &job.destination {
                            if let Ok(options) = serde_json::from_str::<serde_json::Value>(dest) {
                                install_options.replace_existing = options
                                    .get("replace")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
                                install_options.grant_runtime_permissions = options
                                    .get("grant")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
                                install_options.bypass_low_target_sdk_block = options
                                    .get("bypass")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);
                            }
                        }
                        install_application_packages(
                            serial.clone(),
                            vec![job.source.clone()],
                            install_options,
                        )
                        .await
                    }
                    _ => Err(format!("Unknown job type: {}", job.r#type)),
                };

                finish_job(&queue_arc, &app, &job.id, result).await;
            }
        }
    });
}

async fn finish_job(
    queue_arc: &Arc<Mutex<Vec<OperationJob>>>,
    app: &AppHandle,
    job_id: &str,
    result: Result<String, String>,
) {
    let mut queue = queue_arc.lock().await;
    if let Some(job) = queue.iter_mut().find(|j| j.id == job_id) {
        match result {
            Ok(_) => {
                job.status = "success".to_string();
            }
            Err(e) => {
                job.status = "error".to_string();
                job.error = Some(e.clone());

                // Parse ADB push errors using string manipulation
                let mut children = Vec::new();
                for line in e.lines() {
                    if line.starts_with("adb: error: failed to copy '") {
                        let remainder = &line["adb: error: failed to copy '".len()..];
                        if let Some(quote1) = remainder.find("' to '") {
                            let src = &remainder[..quote1];
                            let remainder2 = &remainder[quote1 + "' to '".len()..];
                            if let Some(quote2) = remainder2.find("': ") {
                                let dest = &remainder2[..quote2];
                                let reason = &remainder2[quote2 + "': ".len()..];

                                let name = Path::new(src)
                                    .file_name()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .to_string();

                                children.push(OperationJob {
                                    id: format!(
                                        "{}{}",
                                        std::time::SystemTime::now()
                                            .duration_since(std::time::UNIX_EPOCH)
                                            .unwrap_or_default()
                                            .as_millis(),
                                        rand::random::<u16>()
                                    ),
                                    r#type: job.r#type.clone(),
                                    name,
                                    source: src.to_string(),
                                    destination: Some(dest.to_string()),
                                    is_directory: false,
                                    status: "error".to_string(),
                                    error: Some(reason.to_string()),
                                    children: None,
                                    serial: job.serial.clone(),
                                });
                            }
                        }
                    }
                }

                if !children.is_empty() {
                    job.children = Some(children);
                }
            }
        }
    }
    let _ = app.emit("operations-update", queue.clone());
}
