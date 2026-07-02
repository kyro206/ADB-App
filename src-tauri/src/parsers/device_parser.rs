use std::collections::HashMap;

use crate::models::{Device, DeviceDetails};

/// Parse `adb devices -l` output into a list of Device structs.
pub fn parse_devices(output: &str) -> Vec<Device> {
    let mut devices = Vec::new();
    let lines: Vec<&str> = output.lines().collect();

    let mut iter = lines.iter();
    let mut found_list = false;

    for &line in iter.by_ref() {
        if line.contains("List of devices attached") {
            found_list = true;
            break;
        }
    }

    if !found_list {
        return devices;
    }

    for line in iter {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('*') {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }

        let mut state_idx = 0;
        let valid_states = ["device", "offline", "unauthorized", "recovery", "bootloader", "sideload", "host", "connecting"];

        for (i, part) in parts.iter().enumerate().skip(1) {
            if valid_states.contains(part) {
                state_idx = i;
                break;
            }
        }

        if state_idx == 0 {
            if let Some(idx) = trimmed.find(" no permissions") {
                let serial = trimmed[..idx].trim().to_string();
                devices.push(Device {
                    serial,
                    state: "no permissions".to_string(),
                    product: String::new(),
                    model: String::new(),
                    device: String::new(),
                    transport_id: String::new(),
                });
                continue;
            }
            // Fallback
            state_idx = 1;
        }

        let serial = parts[0..state_idx].join(" ");
        let state = parts[state_idx].to_string();

        if state == "device" {
            let mut product = String::new();
            let mut model = String::new();
            let mut device_name = String::new();
            let mut transport_id = String::new();

            for part in &parts[state_idx + 1..] {
                if part.starts_with("product:") {
                    product = extract_field(part);
                } else if part.starts_with("model:") {
                    model = extract_field(part);
                } else if part.starts_with("device:") {
                    device_name = extract_field(part);
                } else if part.starts_with("transport_id:") {
                    transport_id = extract_field(part);
                }
            }

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
    let mut props = HashMap::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if let Some((key_part, val_part)) = trimmed.split_once("]: [") {
                let key = key_part.strip_prefix('[').unwrap_or(key_part).to_string();
                let value = val_part.strip_suffix(']').unwrap_or(val_part).to_string();
                props.insert(key, value);
            }
        }
    }

    props
}

/// Parse battery level from `dumpsys battery` output.
pub fn parse_battery_level(output: &str) -> i32 {
    let mut level: i64 = -1;
    let mut scale: i64 = -1;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("level:") {
            level = trimmed["level:".len()..].trim().parse().unwrap_or(-1);
        } else if trimmed.starts_with("scale:") {
            scale = trimmed["scale:".len()..].trim().parse().unwrap_or(-1);
        }
    }

    if level < 0 || scale <= 0 {
        return -1;
    }

    ((level as f64 * 100.0) / scale as f64)
        .round()
        .max(0.0)
        .min(100.0) as i32
}

/// Parse battery health from `dumpsys battery` output.
pub fn parse_battery_health(output: &str) -> String {
    let mut fallback_health = "unknown".to_string();
    for line in output.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_ascii_lowercase();

        if lower.starts_with("msavedbatterybsoh:") || lower.starts_with("msavedbatteryasoc:") {
            let val_str = trimmed.split(':').nth(1).unwrap_or("").trim();
            if let Ok(val) = val_str.parse::<i32>() {
                if val > 0 && val <= 100 {
                    return format!("{}%", val);
                }
            }
        } else if lower.starts_with("health:") {
            let val_str = trimmed.split(':').nth(1).unwrap_or("").trim();
            fallback_health = match val_str {
                "2" => "good".to_string(),
                "3" => "overheat".to_string(),
                "4" => "dead".to_string(),
                "5" => "over_voltage".to_string(),
                "6" => "failure".to_string(),
                "7" => "cold".to_string(),
                _ => fallback_health,
            };
        }
    }

    fallback_health
}

/// Parse Android's `dumpsys meminfo` summary, falling back to `/proc/meminfo`.
pub fn parse_memory(output: &str) -> (i64, i64) {
    let mut dumpsys_total: i64 = -1;
    let mut dumpsys_free: i64 = -1;
    let mut mem_total: i64 = -1;
    let mut mem_available: i64 = -1;
    let mut mem_free: i64 = -1;

    for line in output.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_ascii_lowercase();

        if lower.starts_with("total ram:") {
            let parts: Vec<&str> = trimmed["Total RAM:".len()..].trim().split_whitespace().collect();
            if let Some(val_str) = parts.first() {
                dumpsys_total = val_str
                    .replace("K", "")
                    .replace(",", "")
                    .parse()
                    .unwrap_or(-1);
            }
        } else if lower.starts_with("free ram:") {
            let parts: Vec<&str> = trimmed["Free RAM:".len()..].trim().split_whitespace().collect();
            if let Some(val_str) = parts.first() {
                dumpsys_free = val_str.replace("K", "").replace(",", "").parse().unwrap_or(-1);
            }
        } else if lower.starts_with("memtotal:") {
            let parts: Vec<&str> = trimmed["MemTotal:".len()..].trim().split_whitespace().collect();
            if let Some(val_str) = parts.first() {
                mem_total = val_str.parse().unwrap_or(-1);
            }
        } else if lower.starts_with("memavailable:") {
            let parts: Vec<&str> = trimmed["MemAvailable:".len()..].trim().split_whitespace().collect();
            if let Some(val_str) = parts.first() {
                mem_available = val_str.parse().unwrap_or(-1);
            }
        } else if lower.starts_with("memfree:") {
            let parts: Vec<&str> = trimmed["MemFree:".len()..].trim().split_whitespace().collect();
            if let Some(val_str) = parts.first() {
                mem_free = val_str.parse().unwrap_or(-1);
            }
        }
    }

    if dumpsys_total > 0 && dumpsys_free >= 0 && dumpsys_free <= dumpsys_total {
        let used_kb = dumpsys_total - dumpsys_free;
        return (
            (dumpsys_total as f64 / 1024.0).round() as i64,
            (used_kb as f64 / 1024.0).round() as i64,
        );
    }

    if mem_available < 0 {
        mem_available = mem_free;
    }

    if mem_total <= 0 {
        return (-1, -1);
    }

    let total_mb = (mem_total as f64 / 1024.0).round() as i64;
    let available_mb = if mem_available > 0 {
        (mem_available as f64 / 1024.0).round() as i64
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
    let (mut pw, mut ph) = (0, 0);
    let (mut cw, mut ch) = (0, 0);

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Physical size:") {
            let val_str = trimmed["Physical size:".len()..].trim();
            if let Some((w_str, h_str)) = val_str.split_once('x') {
                pw = w_str.parse().unwrap_or(0);
                ph = h_str.parse().unwrap_or(0);
                cw = pw;
                ch = ph;
            }
        } else if trimmed.starts_with("Override size:") {
            let val_str = trimmed["Override size:".len()..].trim();
            if let Some((w_str, h_str)) = val_str.split_once('x') {
                cw = w_str.parse().unwrap_or(cw);
                ch = h_str.parse().unwrap_or(ch);
            }
        }
    }

    (pw, ph, cw, ch)
}

/// Parse `wm density` output.
pub fn parse_wm_density(output: &str) -> (i32, i32) {
    let mut pd = 0;
    let mut cd = 0;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Physical density:") {
            let val_str = trimmed["Physical density:".len()..].trim();
            pd = val_str.parse().unwrap_or(0);
            cd = pd;
        } else if trimmed.starts_with("Override density:") {
            let val_str = trimmed["Override density:".len()..].trim();
            cd = val_str.parse().unwrap_or(cd);
        }
    }

    (pd, cd)
}

pub fn parse_refresh_rates(output: &str) -> (f64, Vec<f64>) {
    let mut rates = Vec::new();
    let mut current = 0.0;

    for line in output.lines() {
        let trimmed = line.trim();
        for keyword in ["fps", "refreshRate", "renderFrameRate"] {
            if let Some(idx) = trimmed.find(keyword) {
                let rest = &trimmed[idx + keyword.len()..].trim();
                let rest = rest.trim_start_matches(|c| c == '=' || c == ':' || c == ' ');
                let val_str = rest
                    .split_whitespace()
                    .next()
                    .unwrap_or("")
                    .split(|c: char| !c.is_ascii_digit() && c != '.')
                    .next()
                    .unwrap_or("");
                if let Ok(rate) = val_str.parse::<f64>() {
                    if rate > 1.0 && rate < 1000.0 {
                        rates.push((rate * 100.0).round() / 100.0);
                    }
                    if keyword == "renderFrameRate" {
                        current = rate;
                    }
                }
            }
        }
    }
    rates.sort_by(|left, right| left.total_cmp(right));
    rates.dedup();
    if current == 0.0 {
        current = rates.first().copied().unwrap_or(0.0);
    }
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
    window_animation_scale_output: &str,
    transition_animation_scale_output: &str,
    animator_duration_scale_output: &str,
    font_scale_output: &str,
    uptime_output: &str,
) -> DeviceDetails {
    let properties = parse_properties(getprop_output);
    let (total_ram_mb, used_ram_mb) = parse_memory(meminfo_output);
    let battery_level = parse_battery_level(battery_output);
    let battery_health = parse_battery_health(battery_output);
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

    let uptime_seconds = uptime_output
        .split_whitespace()
        .next()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(-1.0);

    let window_animation_scale = window_animation_scale_output
        .trim()
        .parse::<f64>()
        .unwrap_or(1.0);
    let transition_animation_scale = transition_animation_scale_output
        .trim()
        .parse::<f64>()
        .unwrap_or(1.0);
    let animator_duration_scale = animator_duration_scale_output
        .trim()
        .parse::<f64>()
        .unwrap_or(1.0);
    let font_scale = font_scale_output.trim().parse::<f64>().unwrap_or(1.0);

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
        battery_health,
        total_storage_mb,
        used_storage_mb,
        dark_mode_enabled: dark_mode,
        screen_off_timeout_ms: screen_timeout,
        uptime_seconds,
        window_animation_scale,
        transition_animation_scale,
        animator_duration_scale,
        font_scale,
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

#[cfg(test)]
mod tests {
    use super::parse_memory;

    #[test]
    fn calculates_android_used_memory_from_total_and_free_ram() {
        let output = r#"
Total RAM: 7,654,321K (status normal)
 Free RAM: 2,100,000K (1,000,000K cached pss + 800,000K cached kernel + 300,000K free)
 Used RAM: 5,123,456K (4,000,000K used pss + 1,123,456K kernel)
"#;

        assert_eq!(parse_memory(output), (7475, 5424));
    }

    #[test]
    fn ignores_invalid_dumpsys_used_ram_larger_than_total() {
        let output = r#"
Total RAM: 11,156,420K (status normal)
 Free RAM: 5,043,894K (3,230,690K cached pss + 1,522,824K cached kernel + 290,380K free)
 Used RAM: 141,383,449K (5,597,905K used pss + 135,785,544K kernel)
 Lost RAM: -133,561,032K
"#;

        assert_eq!(parse_memory(output), (10895, 5969));
    }

    #[test]
    fn parses_proc_meminfo_with_windows_line_endings() {
        let output =
            "MemTotal:        8192000 kB\r\nMemFree:         1000000 kB\r\nMemAvailable:    3072000 kB\r\n";

        assert_eq!(parse_memory(output), (8000, 5000));
    }
}
