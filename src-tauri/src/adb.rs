use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncReadExt;
use tokio::time::timeout;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

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
    let result = timeout(DEFAULT_TIMEOUT, async {
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

        Ok::<AdbResult, String>(AdbResult {
            exit_code,
            output: combined,
        })
    })
    .await;

    match result {
        Ok(inner) => inner,
        Err(_) => Err("ADB command timed out".to_string()),
    }
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
    let result = timeout(DEFAULT_TIMEOUT, async {
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
        Ok::<(i32, Vec<u8>), String>((exit_code, stdout_bytes))
    })
    .await;

    match result {
        Ok(inner) => inner,
        Err(_) => Err("ADB binary command timed out".to_string()),
    }
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
