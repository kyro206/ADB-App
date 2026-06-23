use std::process::Stdio;
use std::time::Duration;
use tauri::Emitter;
use tokio::io::AsyncReadExt;
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Debug, Clone)]
pub struct AdbResult {
    pub exit_code: i32,
    pub output: String,
}

impl AdbResult {
    pub fn ok(&self) -> bool {
        self.exit_code == 0
    }
}

/// Run an ADB command and return the text output.
pub async fn run_adb(args: &[&str]) -> Result<AdbResult, String> {
    let path = crate::tools::resolve_tool_path("adb")
        .ok_or_else(|| "ADB is not installed. Configure or install it in Settings.".to_string())?;
    run_adb_with_path(path.to_string_lossy().as_ref(), args).await
}

/// Run an ADB command with a specific adb path.
pub async fn run_adb_with_path(adb_path: &str, args: &[&str]) -> Result<AdbResult, String> {
    let mut cmd = crate::process::tokio_command(adb_path);
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn adb: {}", e))?;

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to wait for adb: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    let combined = if stderr.is_empty() {
        stdout
    } else if stdout.is_empty() {
        stderr
    } else {
        format!("{}\n{}", stdout, stderr)
    };

    let exit_code = output.status.code().unwrap_or(-1);

    Ok(AdbResult {
        exit_code,
        output: combined,
    })
}

/// Run an ADB command targeting a specific device serial.
pub async fn run_adb_for_serial(serial: &str, args: &[&str]) -> Result<AdbResult, String> {
    let mut full_args = vec!["-s", serial];
    full_args.extend_from_slice(args);
    run_adb(&full_args).await
}

/// Run an ADB command and return binary (raw bytes) output.
pub async fn run_adb_binary(args: &[&str]) -> Result<(i32, Vec<u8>), String> {
    let path = crate::tools::resolve_tool_path("adb")
        .ok_or_else(|| "ADB is not installed. Configure or install it in Settings.".to_string())?;
    run_adb_binary_with_path(path.to_string_lossy().as_ref(), args).await
}

/// Run an ADB command with a specific path and return binary output.
pub async fn run_adb_binary_with_path(
    adb_path: &str,
    args: &[&str],
) -> Result<(i32, Vec<u8>), String> {
    let mut cmd = crate::process::tokio_command(adb_path);
    cmd.args(args).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn adb: {}", e))?;

    let mut stdout_bytes = Vec::new();
    if let Some(mut stdout) = child.stdout.take() {
        stdout
            .read_to_end(&mut stdout_bytes)
            .await
            .map_err(|e| format!("Failed to read stdout: {}", e))?;
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for adb: {}", e))?;

    let exit_code = status.code().unwrap_or(-1);
    Ok((exit_code, stdout_bytes))
}

/// Run an ADB binary command targeting a specific device serial.
pub async fn run_adb_binary_for_serial(
    serial: &str,
    args: &[&str],
) -> Result<(i32, Vec<u8>), String> {
    let mut full_args = vec!["-s", serial];
    full_args.extend_from_slice(args);
    run_adb_binary(&full_args).await
}

/// Start a background tracker that emits a Tauri event when devices change
pub async fn start_device_tracker(app: tauri::AppHandle) {
    loop {
        let path = match crate::tools::resolve_tool_path("adb") {
            Some(p) => p,
            None => {
                tokio::time::sleep(Duration::from_secs(5)).await;
                continue;
            }
        };

        let mut cmd = crate::process::tokio_command(path.to_string_lossy().as_ref());
        cmd.arg("track-devices")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Ok(mut child) = cmd.spawn() {
            if let Some(stdout) = child.stdout.take() {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(_line)) = reader.next_line().await {
                    let _ = app.emit("device-list-changed", ());
                }
            }
            let _ = child.wait().await;
        }

        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}
