use regex::Regex;
use std::collections::HashMap;

use crate::models::{Device, DeviceDetails};

/// Parse `adb devices -l` output into a list of Device structs.
pub fn parse_devices(output: &str) -> Vec<Device> {
    let mut devices = Vec::new();
    let lines: Vec<&str> = output.lines().collect();

    if lines.is_empty() || !lines[0].contains("List of devices attached") {
        return devices;
    }

    for line in lines.iter().skip(1) {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('*') {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }

        let serial = parts[0].to_string();
        let state = parts[1].to_string();

        if state == "device" && parts.len() >= 6 {
            let product = extract_field(parts[2]);
            let model = extract_field(parts[3]);
            let device_name = extract_field(parts[4]);
            let transport_id = extract_field(parts[5]);
            devices.push(Device {
                serial,
                state,
                product,
                model,
                device: device_name,
                transport_id,
            });
        } else {
            devices.push(Device {
                serial,
                state,
                product: String::new(),
                model: String::new(),
                device: String::new(),
                transport_id: String::new(),
            });
        }
    }

    devices
}

fn extract_field(field: &str) -> String {
    if let Some(pos) = field.find(':') {
        field[pos + 1..].to_string()
    } else {
        field.to_string()
    }
}

/// Parse `getprop` output into a map of properties.
pub fn parse_properties(output: &str) -> HashMap<String, String> {
    let re = Regex::new(r"^\[(.+?)\]: \[(.*?)\]$").unwrap();
    let mut props = HashMap::new();

    for line in output.lines() {
        if let Some(caps) = re.captures(line.trim()) {
            let key = caps.get(1).unwrap().as_str().to_string();
            let value = caps.get(2).unwrap().as_str().to_string();
            props.insert(key, value);
        }
    }

    props
}

/// Parse battery level from `dumpsys battery` output.
pub fn parse_battery_level(output: &str) -> i32 {
    let level_re = Regex::new(r"(?m)^\s*level:\s*(\d+)\s*$").unwrap();
    let scale_re = Regex::new(r"(?m)^\s*scale:\s*(\d+)\s*$").unwrap();

    let level: i64 = level_re
        .captures(output)
        .and_then(|c| c.get(1)?.as_str().parse().ok())
        .unwrap_or(-1);

    let scale: i64 = scale_re
        .captures(output)
        .and_then(|c| c.get(1)?.as_str().parse().ok())
        .unwrap_or(-1);

    if level < 0 || scale <= 0 {
        return -1;
    }

    ((level as f64 * 100.0) / scale as f64)
        .round()
        .max(0.0)
        .min(100.0) as i32
}

/// Parse memory info from `/proc/meminfo`.
pub fn parse_memory(output: &str) -> (i64, i64) {
    let total_re = Regex::new(r"(?m)^MemTotal:\s+(\d+)\s+kB$").unwrap();
    let available_re = Regex::new(r"(?m)^MemAvailable:\s+(\d+)\s+kB$").unwrap();
    let free_re = Regex::new(r"(?m)^MemFree:\s+(\d+)\s+kB$").unwrap();

    let total_kb: i64 = total_re
        .captures(output)
        .and_then(|c| c.get(1)?.as_str().parse().ok())
        .unwrap_or(-1);

    let mut available_kb: i64 = available_re
        .captures(output)
        .and_then(|c| c.get(1)?.as_str().parse().ok())
        .unwrap_or(-1);

    if available_kb < 0 {
        available_kb = free_re
            .captures(output)
            .and_then(|c| c.get(1)?.as_str().parse().ok())
            .unwrap_or(-1);
    }

    if total_kb <= 0 {
        return (-1, -1);
    }

    let total_mb = (total_kb as f64 / 1024.0).round() as i64;
    let available_mb = if available_kb > 0 {
        (available_kb as f64 / 1024.0).round() as i64
    } else {
        -1
    };
    let used_mb = if available_mb >= 0 {
        (total_mb - available_mb).max(0)
    } else {
        -1
    };

    (total_mb, used_mb)
}

/// Parse storage from `df -k /data`.
pub fn parse_storage(output: &str) -> (i64, i64) {
    if output.trim().is_empty() {
        return (-1, -1);
    }

    let mut fallback = (-1i64, -1i64);

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("Filesystem") {
            continue;
        }

        let tokens: Vec<&str> = trimmed.split_whitespace().collect();
        if tokens.len() < 4 {
            continue;
        }

        let total_kb: i64 = match tokens[1].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };
        let used_kb: i64 = match tokens[2].parse() {
            Ok(v) => v,
            Err(_) => continue,
        };

        let total_mb = (total_kb as f64 / 1024.0).round() as i64;
        let used_mb = (used_kb as f64 / 1024.0).round() as i64;
        fallback = (total_mb, used_mb);

        let mount_point = tokens.last().unwrap_or(&"");
        if *mount_point == "/data"
            || mount_point.starts_with("/data/")
            || *mount_point == "/storage/emulated"
            || mount_point.starts_with("/storage/emulated/")
        {
            return fallback;
        }
    }

    fallback
}

/// Parse `wm size` output.
pub fn parse_wm_size(output: &str) -> (i32, i32, i32, i32) {
    let physical_re = Regex::new(r"Physical size:\s*(\d+)x(\d+)").unwrap();
    let override_re = Regex::new(r"Override size:\s*(\d+)x(\d+)").unwrap();

    let (mut pw, mut ph) = (0, 0);
    let (mut cw, mut ch) = (0, 0);

    if let Some(caps) = physical_re.captures(output) {
        pw = caps.get(1).unwrap().as_str().parse().unwrap_or(0);
        ph = caps.get(2).unwrap().as_str().parse().unwrap_or(0);
        cw = pw;
        ch = ph;
    }

    if let Some(caps) = override_re.captures(output) {
        cw = caps.get(1).unwrap().as_str().parse().unwrap_or(cw);
        ch = caps.get(2).unwrap().as_str().parse().unwrap_or(ch);
    }

    (pw, ph, cw, ch)
}

/// Parse `wm density` output.
pub fn parse_wm_density(output: &str) -> (i32, i32) {
    let physical_re = Regex::new(r"Physical density:\s*(\d+)").unwrap();
    let override_re = Regex::new(r"Override density:\s*(\d+)").unwrap();

    let mut pd = 0;
    let mut cd = 0;

    if let Some(caps) = physical_re.captures(output) {
        pd = caps.get(1).unwrap().as_str().parse().unwrap_or(0);
        cd = pd;
    }

    if let Some(caps) = override_re.captures(output) {
        cd = caps.get(1).unwrap().as_str().parse().unwrap_or(cd);
    }

    (pd, cd)
}

pub fn parse_refresh_rates(output: &str) -> (f64, Vec<f64>) {
    let rate_re = Regex::new(r"(?:fps|refreshRate|renderFrameRate)[=: ]+(\d+(?:\.\d+)?)").unwrap();
    let current_re = Regex::new(r"renderFrameRate[=: ]+(\d+(?:\.\d+)?)").unwrap();
    let mut rates = rate_re
        .captures_iter(output)
        .filter_map(|capture| capture.get(1)?.as_str().parse::<f64>().ok())
        .filter(|rate| *rate > 1.0 && *rate < 1000.0)
        .map(|rate| (rate * 100.0).round() / 100.0)
        .collect::<Vec<_>>();
    rates.sort_by(|left, right| left.total_cmp(right));
    rates.dedup();
    let current = current_re
        .captures(output)
        .and_then(|capture| capture.get(1)?.as_str().parse().ok())
        .or_else(|| rates.first().copied())
        .unwrap_or(0.0);
    (current, rates)
}

/// Parse dark mode from either `cmd uimode night` or the secure setting.
pub fn parse_dark_mode(output: &str) -> bool {
    matches!(
        output.trim().to_ascii_lowercase().as_str(),
        "2" | "yes" | "night mode: yes"
    )
}

/// Parse screen off timeout from `settings get system screen_off_timeout`.
pub fn parse_screen_off_timeout(output: &str) -> i32 {
    output.trim().parse().unwrap_or(60000)
}

/// Build SoC value from device properties.
pub fn build_soc_value(properties: &HashMap<String, String>) -> String {
    let soc_model = first_non_blank(&[
        properties.get("ro.soc.model").map(|s| s.as_str()),
        properties.get("ro.board.platform").map(|s| s.as_str()),
    ]);
    let board_platform = properties
        .get("ro.board.platform")
        .map(|s| s.as_str())
        .unwrap_or("");
    let hardware = properties
        .get("ro.hardware")
        .map(|s| s.as_str())
        .unwrap_or("");

    if soc_model.is_empty() && hardware.is_empty() {
        return "-".to_string();
    }

    if !board_platform.is_empty() && board_platform != soc_model {
        return format!("{} ({})", soc_model, board_platform);
    }

    if soc_model.is_empty() {
        return hardware.to_string();
    }

    if !hardware.is_empty()
        && !hardware.eq_ignore_ascii_case(&soc_model)
        && !hardware.eq_ignore_ascii_case(board_platform)
    {
        return format!("{} [{}]", soc_model, hardware);
    }

    soc_model.to_string()
}

/// Build architecture value from device properties.
pub fn build_architecture_value(properties: &HashMap<String, String>) -> String {
    let abi_list = first_non_blank(&[
        properties
            .get("ro.product.cpu.abilist64")
            .map(|s| s.as_str()),
        properties.get("ro.product.cpu.abilist").map(|s| s.as_str()),
        properties.get("ro.product.cpu.abi").map(|s| s.as_str()),
    ]);

    if abi_list.is_empty() {
        "-".to_string()
    } else {
        abi_list.replace(",", ", ")
    }
}

/// Detect device type from features and properties.
pub fn detect_device_type(properties: &HashMap<String, String>, features_output: &str) -> String {
    let features_lower = features_output.to_lowercase();

    if features_lower.contains("android.hardware.type.watch") {
        return "watch".to_string();
    }
    if features_lower.contains("android.hardware.type.television")
        || features_lower.contains("android.software.leanback")
    {
        return "tv".to_string();
    }
    if features_lower.contains("android.hardware.type.automotive") {
        return "automotive".to_string();
    }
    if features_lower.contains("android.hardware.type.embedded") {
        return "embedded".to_string();
    }
    if features_lower.contains("android.hardware.type.pc") {
        return "desktop".to_string();
    }

    let characteristics = properties
        .get("ro.build.characteristics")
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    if characteristics.contains("tablet") {
        return "tablet".to_string();
    }
    if characteristics.contains("foldable")
        || properties
            .get("ro.product.device")
            .map(|s| s.to_lowercase().contains("fold"))
            .unwrap_or(false)
    {
        return "foldable".to_string();
    }

    if features_lower.contains("android.hardware.telephony") {
        return "phone".to_string();
    }

    "device".to_string()
}

/// Build full DeviceDetails from all device info queries.
pub fn build_device_details(
    device: &Device,
    getprop_output: &str,
    meminfo_output: &str,
    battery_output: &str,
    storage_output: &str,
    features_output: &str,
    wm_size_output: &str,
    wm_density_output: &str,
    display_output: &str,
    dark_mode_output: &str,
    screen_timeout_output: &str,
) -> DeviceDetails {
    let properties = parse_properties(getprop_output);
    let (total_ram_mb, used_ram_mb) = parse_memory(meminfo_output);
    let battery_level = parse_battery_level(battery_output);
    let (total_storage_mb, used_storage_mb) = parse_storage(storage_output);
    let (pw, ph, cw, ch) = parse_wm_size(wm_size_output);
    let (pd, cd) = parse_wm_density(wm_density_output);
    let smallest_width_dp = if cd > 0 {
        ((cw.min(ch) as f64 * 160.0) / cd as f64).round() as i32
    } else {
        0
    };
    let (refresh_rate_hz, supported_refresh_rates_hz) = parse_refresh_rates(display_output);
    let dark_mode = parse_dark_mode(dark_mode_output);
    let screen_timeout = parse_screen_off_timeout(screen_timeout_output);
    let device_type = detect_device_type(&properties, features_output);

    let manufacturer = safe_value(&first_non_blank(&[
        properties
            .get("ro.product.manufacturer")
            .map(|s| s.as_str()),
        properties.get("ro.product.brand").map(|s| s.as_str()),
    ]));

    let brand = safe_value(&first_non_blank(&[
        properties.get("ro.product.brand").map(|s| s.as_str()),
        Some(&manufacturer),
    ]));

    let model = safe_value(&first_non_blank(&[
        properties.get("ro.product.model").map(|s| s.as_str()),
        if device.model.is_empty() {
            None
        } else {
            Some(device.model.as_str())
        },
    ]));

    let codename = safe_value(&first_non_blank(&[
        properties.get("ro.product.device").map(|s| s.as_str()),
        if device.device.is_empty() {
            None
        } else {
            Some(device.device.as_str())
        },
    ]));

    let product_name = safe_value(&first_non_blank(&[
        properties.get("ro.product.name").map(|s| s.as_str()),
        if device.product.is_empty() {
            None
        } else {
            Some(device.product.as_str())
        },
    ]));

    let marketing_name = safe_value(&first_non_blank(&[
        properties.get("ro.product.marketname").map(|s| s.as_str()),
        properties
            .get("ro.vendor.product.display")
            .map(|s| s.as_str()),
        properties
            .get("ro.product.vendor.marketname")
            .map(|s| s.as_str()),
        properties
            .get("ro.config.marketing_name")
            .map(|s| s.as_str()),
        Some(&model),
    ]));

    let android_version = safe_value(&first_non_blank(&[
        properties
            .get("ro.build.version.release")
            .map(|s| s.as_str()),
        properties
            .get("ro.build.version.release_or_codename")
            .map(|s| s.as_str()),
    ]));

    let api_level = safe_value(
        &properties
            .get("ro.build.version.sdk")
            .cloned()
            .unwrap_or_else(|| "-".to_string()),
    );

    let soc = build_soc_value(&properties);
    let architecture = build_architecture_value(&properties);

    DeviceDetails {
        serial: device.serial.clone(),
        state: device.state.clone(),
        manufacturer,
        brand,
        model,
        marketing_name,
        codename,
        product_name,
        android_version,
        api_level,
        soc,
        architecture,
        device_type,
        physical_width: pw,
        physical_height: ph,
        current_width: cw,
        current_height: ch,
        physical_density: pd,
        current_density: cd,
        smallest_width_dp,
        refresh_rate_hz,
        supported_refresh_rates_hz,
        total_ram_mb,
        used_ram_mb,
        battery_level_percent: battery_level,
        total_storage_mb,
        used_storage_mb,
        dark_mode_enabled: dark_mode,
        screen_off_timeout_ms: screen_timeout,
    }
}

fn first_non_blank(values: &[Option<&str>]) -> String {
    for value in values {
        if let Some(v) = value {
            let trimmed = v.trim();
            if !trimmed.is_empty() && trimmed != "-" {
                return trimmed.to_string();
            }
        }
    }
    String::new()
}

fn safe_value(value: &str) -> String {
    if value.trim().is_empty() {
        "-".to_string()
    } else {
        value.to_string()
    }
}
