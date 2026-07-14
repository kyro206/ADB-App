<script lang="ts">
  import * as m from "../paraglide/messages";

  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, emit } from "@tauri-apps/api/event";
  import { save, open } from "@tauri-apps/plugin-dialog";
  import { getName } from "@tauri-apps/api/app";
  import { devicesState, type DeviceDetails } from "../context/devices.svelte";
  import { i18n } from "../context/i18n.svelte";
  import { themeState } from "../context/theme.svelte";
  import MaterialIcon from "../components/MaterialIcon.svelte";
  import PowerDialog from "../components/dialogs/PowerDialog.svelte";
  import { getMarketingName } from "./workbench/utils";

  const formatMemory = (mb: number) =>
    mb <= 0 ? "-" : mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  const formatStorage = (mb: number) =>
    mb <= 0
      ? "-"
      : mb >= 1024 * 1024
        ? `${(mb / 1024 / 1024).toFixed(2)} TB`
        : mb >= 1024
          ? `${(mb / 1024).toFixed(1)} GB`
          : `${mb} MB`;
          
  const secondaryTitle = (details: DeviceDetails) => {
    const marketingName = getMarketingName(details.model, details.brand);

    return [marketingName || details.model, details.soc]
      .filter((value) => value && value !== "-")
      .join(" · ");
  };


  let timeNow = $state(import.meta.env.MODE === 'mock' ? new Date('2026-06-15T09:45:00') : new Date());
  let capturing = $state(false);
  let savingScreenshot = $state(false);
  let autoSavedScreenshotPath = $state<string | null>(null);
  let powerOpen = $state(false);
  let powerBusy = $state(false);
  let shizukuStatus = $state<"idle" | "busy" | "success" | "error">("idle");
  let appName = $state("ADB App");
  let deviceName = $state("ADB App");
  let carrierName = $state("");
  let actionError = $state<string | null>(null);
  let shizukuError = $state<string | null>(null);

  let dd = $derived(devicesState.deviceDetails);
  let selectedDevice = $derived(devicesState.selectedDevice);
  let selectedSerial = $derived(selectedDevice?.serial ?? "");
  let selectedState = $derived(selectedDevice?.state ?? "");
  let homeIdentity = $derived(devicesState.homeIdentity);

  $effect(() => {
    if (homeIdentity?.serial !== selectedSerial) return;
    deviceName = homeIdentity.deviceName;
    carrierName = homeIdentity.carrierName;
  });

  function fetchDeviceNameAndCarrier(serial: string) {
    if (!serial) return;
    invoke<{ device_name: string; airplane_mode: boolean; carrier: string }>(
      "get_home_details",
      { serial },
    )
      .then((details) => {
        if (serial !== selectedSerial) return;

        if (details.device_name) {
          deviceName = details.device_name;
        } else {
          deviceName = appName;
        }

        if (details.carrier) {
          carrierName = details.carrier;
        } else if (details.airplane_mode) {
          carrierName = m.home_airplane_mode
            ? m.home_airplane_mode()
            : "Airplane Mode";
        } else if (selectedState === "device") {
          carrierName = "";
        }
        devicesState.cacheHomeIdentity(serial, deviceName, carrierName);
      })
      .catch(() => {
        const cached = devicesState.homeIdentity;
        if (cached?.serial === serial) {
          deviceName = cached.deviceName;
          carrierName = cached.carrierName;
        } else if (serial === selectedSerial && selectedState === "device") {
          deviceName = appName;
          carrierName = "";
        }
      });
  }

  onMount(() => {

    getName()
      .then((name) => {
        appName = name;
        if (deviceName === "ADB App") deviceName = name;
      })
      .catch(() => {});

    if (selectedSerial && selectedState === "device") {
      devicesState.refreshDeviceDetailsSilent();
      fetchDeviceNameAndCarrier(selectedSerial);
    }

    const runtimeInterval = window.setInterval(() => {
      if (selectedSerial && selectedState === "device") {
        devicesState.refreshDeviceRuntimeStateSilent();
      }
    }, 10000);

    const identityInterval = window.setInterval(() => {
      if (selectedSerial && selectedState === "device") {
        fetchDeviceNameAndCarrier(selectedSerial);
      }
    }, 30000);

    return () => {
      window.clearInterval(runtimeInterval);
      window.clearInterval(identityInterval);
    };
  });

  $effect(() => {
    if (selectedSerial && selectedState === "device") {
      fetchDeviceNameAndCarrier(selectedSerial);
    }
  });

  $effect(() => {
    if (!devicesState.wallpaperImage || devicesState.screenshot) return;
    if (import.meta.env.MODE === 'mock') return;

    const clockInterval = window.setInterval(() => {
      timeNow = new Date();
    }, 1000);

    return () => window.clearInterval(clockInterval);
  });

  let bootDate = $derived.by(() => {
    if (dd && dd.uptime_seconds >= 0) {
      const date = new Date(timeNow.getTime() - dd.uptime_seconds * 1000);
      return {
        short: date
          .toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
          .replace(",", ""),
        full: date.toLocaleString(undefined, {
          dateStyle: "long",
          timeStyle: "medium",
        }),
      };
    }
    return null;
  });

  let stateLabel = $derived.by(() => {
    if (!devicesState.selectedDevice) return "-";
    const state = devicesState.selectedDevice.state;
    const labels: Record<string, string> = {
      device: m.state_connected(),
      connecting: m.state_connecting(),
      unauthorized: m.state_unauthorized(),
      offline: m.state_offline(),
      recovery: m.power_btn_recovery(),
      unknown: m.device_type_unknown(),
      bootloader: m.power_btn_bootloader(),
      fastboot: m.power_btn_fastbootd(),
      download: m.power_btn_download(),
    };
    return labels[state] || state.charAt(0).toUpperCase() + state.slice(1);
  });

  let previewStateIcon = $derived.by(() => {
    if (!devicesState.selectedDevice) return "smartphone";
    switch (devicesState.selectedDevice.state) {
      case "device":
        return "check_circle";
      case "recovery":
        return "health_and_safety";
      case "bootloader":
        return "developer_board";
      case "fastboot":
        return "terminal";
      case "fastbootd":
        return "terminal";
      case "download":
        return "download";
      case "unauthorized":
        return "lock";
      case "offline":
        return "phonelink_off";
      case "connecting":
        return "sync";
      default:
        return "smartphone";
    }
  });

  let previewStateColor = $derived.by(() => {
    if (!devicesState.selectedDevice) return "";
    switch (devicesState.selectedDevice.state) {
      case "device":
        return "color: #4caf50;";
      case "recovery":
        return "color: var(--md-sys-color-error, #f44336);";
      case "unauthorized":
        return "color: var(--md-sys-color-error, #f44336);";
      case "offline":
        return "color: var(--md-sys-color-outline, #9e9e9e);";
      default:
        return "color: var(--md-sys-color-primary);";
    }
  });

  let previewStateHint = $derived.by(() => {
    if (!devicesState.selectedDevice) return null;
    switch (devicesState.selectedDevice.state) {
      case "recovery":
        return m.power_hint_recovery();
      case "bootloader":
        return m.power_hint_bootloader();
      case "fastboot":
      case "fastbootd":
        return m.power_hint_fastbootd();
      case "download":
        return m.power_hint_download();
      default:
        return null;
    }
  });

  let lockscreenTimeParts = $derived.by(() => {
    const time = timeNow.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = time.match(/\d+/g) ?? ["--", "--"];
    return [parts[0] ?? "--", parts[1] ?? "--"];
  });

  let lockscreenDate = $derived(
    timeNow.toLocaleDateString(i18n.language, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  );

  async function captureScreenshot() {
    if (!selectedDevice || selectedState !== "device") return;
    capturing = true;
    actionError = null;
    autoSavedScreenshotPath = null;
    try {
      const settings = await invoke<any>("get_app_settings");
      if (settings?.auto_save_screenshots) {
        const deviceNameRaw = devicesState.homeIdentity?.deviceName || selectedDevice.device || selectedDevice.model || "Unknown";
        
        const fileNameBase = new Date().toISOString().replace(/[:.]/g, "-");
        const result = await invoke<{ base64: string, saved_path: string | null, save_error: string | null }>("capture_and_save_screenshot_auto", {
          serial: selectedDevice.serial,
          deviceName: deviceNameRaw,
          fileNameBase: fileNameBase,
        });

        devicesState.screenshot = `data:image/png;base64,${result.base64}`;
        
        if (result.save_error) {
          actionError = result.save_error;
        } else {
          autoSavedScreenshotPath = result.saved_path;
        }
      } else {
        const base64 = await invoke<string>("capture_screenshot", { serial: selectedDevice.serial });
        devicesState.screenshot = `data:image/png;base64,${base64}`;
      }
    } catch (e) {
      actionError = String(e);
    } finally {
      capturing = false;
    }
  }

  async function saveScreenshotData() {
    if (!devicesState.screenshot || !selectedDevice || savingScreenshot) return;
    const destination = await save({
      title: m.home_saveCapture(),
      defaultPath: `${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
      filters: [{ name: "Imagen PNG", extensions: ["png"] }],
    });
    if (!destination) return;
    savingScreenshot = true;
    actionError = null;
    try {
      await invoke<string>("save_screenshot", {
        path: destination,
        pngBase64: devicesState.screenshot.replace(
          /^data:image\/png;base64,/,
          "",
        ),
      });
    } catch (e) {
      actionError = String(e);
    } finally {
      savingScreenshot = false;
    }
  }

  async function saveWallpaperData() {
    if (!devicesState.wallpaperImage || !selectedDevice || savingScreenshot)
      return;
    const destination = await save({
      title: m.home_saveWallpaper(),
      defaultPath: `adb-wallpaper-${new Date().toISOString().replace(/[:.]/g, "-")}.png`,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (!destination) return;
    savingScreenshot = true;
    actionError = null;
    try {
      await invoke("save_device_wallpaper_to_disk", {
        serial: selectedDevice.serial,
        path: destination,
      });
    } catch (e) {
      actionError = String(e);
    } finally {
      savingScreenshot = false;
    }
  }

  async function performPowerAction(_label: string, args: string[]) {
    if (!selectedDevice || powerBusy) return;
    powerBusy = true;
    powerOpen = false;
    actionError = null;
    try {
      await invoke<string>("run_device_action", {
        serial: selectedDevice.serial,
        args,
      });
      window.setTimeout(() => devicesState.refreshDevices(), 4000);
    } catch (error) {
      actionError = String(error);
    } finally {
      powerBusy = false;
    }
  }

  async function startShizuku() {
    if (
      !selectedDevice ||
      selectedState !== "device" ||
      shizukuStatus === "busy"
    )
      return;
    shizukuStatus = "busy";
    shizukuError = null;
    try {
      await invoke("run_device_action", {
        serial: selectedDevice.serial,
        args: [
          "shell",
          "sh /sdcard/Android/data/moe.shizuku.privileged.api/start.sh &",
        ],
      });
      shizukuStatus = "success";
    } catch (e) {
      shizukuError = String(e);
      shizukuStatus = "error";
    } finally {
      setTimeout(() => {
        if (shizukuStatus !== "error") shizukuStatus = "idle";
      }, 2000);
    }
  }

  let sideloadBusy = $state(false);
  let sideloadProgress = $state(0);

  async function startSideload() {
    if (!selectedDevice || selectedState !== "recovery" || sideloadBusy) return;
    actionError = null;
    const file = await open({
      multiple: false,
      filters: [{ name: "OTA Update", extensions: ["zip"] }],
    });
    if (!file) return;

    sideloadBusy = true;
    sideloadProgress = 0;

    const unlisten = await listen<number>("sideload-progress", (event) => {
      sideloadProgress = event.payload;
    });

    try {
      await invoke("sideload_device", {
        serial: selectedDevice.serial,
        filePath: file,
      });
      setTimeout(() => devicesState.refreshDevices(), 2000);
    } catch (error) {
      actionError = String(error);
    } finally {
      sideloadBusy = false;
      unlisten();
    }
  }

  function cancelSideload() {
    emit("cancel-sideload");
  }

  async function rebootFromPreview() {
    if (!selectedDevice) return;
    actionError = null;
    try {
      await invoke("run_device_action", {
        serial: selectedDevice.serial,
        args: ["reboot"],
      });
    } catch (error) {
      actionError = String(error);
    }
  }

  let facts = $derived<Array<[string, string, string, string?]>>([
    [
      "android",
      "Android",
      dd ? `${dd.android_version} (API ${dd.api_level})` : "-",
    ],
    [
      "devices",
      m.home_field_deviceType(),
      dd ? ((m as any)[`device_type_${dd.device_type}`]?.() ?? "-") : "-",
    ],
    ["tablet_android", m.home_field_model(), dd?.model || "-"],
    ["factory", m.home_field_manufacturer(), dd?.manufacturer || "-"],
    ["verified", m.home_field_brand(), dd?.brand || "-"],
    ["developer_board", m.home_field_architecture(), dd?.architecture || "-"],
    ["inventory_2", m.home_field_product(), dd?.product_name || "-"],
    ["tag", m.home_field_codename(), dd?.codename || "-"],
    ["fingerprint", m.home_field_serial(), dd?.serial || "-"],
    [
      "schedule",
      m.home_field_uptime(),
      bootDate?.short || "-",
      bootDate?.full || "-",
    ],
  ]);

  onDestroy(() => {
    devicesState.screenshot = null;
    autoSavedScreenshotPath = null;
  });
</script>

<main class="home-material">
  <div class="home-material__content">
    <section class="material-surface home-hero">
      <div>
        <h2>{deviceName}</h2>
        <p>{dd ? secondaryTitle(dd) : m.home_summary_empty()}</p>
        <div
          class="home-popular-actions"
          style="margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;"
        >
          <md-filled-tonal-button
            disabled={!devicesState.selectedDevice ||
            devicesState.selectedDevice.state !== "device" ||
            shizukuStatus === "busy"
              ? true
              : undefined}
            onclick={startShizuku}
          >
            <span slot="icon">
              <MaterialIcon
                name={shizukuStatus === "success"
                  ? "check"
                  : shizukuStatus === "error"
                    ? "close"
                    : shizukuStatus === "busy"
                      ? "sync"
                      : "adb"}
                class={shizukuStatus === "busy" ? "home-spin" : ""}
              />
            </span>
            {m.home_action_shizuku()}
          </md-filled-tonal-button>
          {#if shizukuError}
            <span
              style="color: var(--md-sys-color-error, #f44336); font-size: 0.85rem; max-width: 250px; line-height: 1.2;"
              >{shizukuError}</span
            >
          {/if}
          {#if actionError && devicesState.selectedDevice?.state !== "recovery"}
            <span
              style="color: var(--md-sys-color-error, #f44336); font-size: 0.85rem; max-width: 250px; line-height: 1.2;"
              >{actionError}</span
            >
          {/if}
        </div>
      </div>
      <div class="home-hero__actions">
        <md-filled-tonal-icon-button
          aria-label={m.home_power_options()}
          title={m.home_power_options()}
          disabled={!devicesState.selectedDevice || powerBusy || devicesState.selectedDevice.state === "unauthorized"
            ? true
            : undefined}
          onclick={() => (powerOpen = true)}
        >
          <span class="material-symbols-rounded">power_settings_new</span>
        </md-filled-tonal-icon-button>
      </div>
    </section>

    <div class="home-metrics">
      <section class="material-surface home-metric">
        <MaterialIcon name="battery_android_full" />
        <div>
          <span>{m.home_field_battery()}</span>
          <strong
            >{dd?.battery_level_percent != null && dd.battery_level_percent >= 0
              ? `${dd.battery_level_percent}%`
              : "-"}</strong
          >
          <small
            >{m.home_battery_health()}: {dd?.battery_health
              ? dd.battery_health.includes("%")
                ? dd.battery_health
                : ((m as any)[`battery_health_${dd.battery_health}`]?.() ?? "-")
              : "-"}</small
          >
          <md-linear-progress
            value={Math.max(
              0,
              Math.min(1, (dd?.battery_level_percent || 0) / 100),
            )}
          ></md-linear-progress>
        </div>
      </section>

      <section class="material-surface home-metric">
        <MaterialIcon name="memory" />
        <div>
          <span>{m.home_ram_inUse()}</span>
          <strong>{dd ? formatMemory(dd.used_ram_mb) : "-"}</strong>
          <small
            >{m.home_field_total()}: {dd
              ? formatMemory(dd.total_ram_mb)
              : "-"}</small
          >
          <md-linear-progress
            value={dd?.total_ram_mb
              ? Math.max(0, Math.min(1, dd.used_ram_mb / dd.total_ram_mb))
              : 0}
          ></md-linear-progress>
        </div>
      </section>

      <section class="material-surface home-metric">
        <MaterialIcon name="hard_drive" />
        <div>
          <span>{m.home_storage_inUse()}</span>
          <strong>{dd ? formatStorage(dd.used_storage_mb) : "-"}</strong>
          <small
            >{m.home_field_total()}: {dd
              ? formatStorage(dd.total_storage_mb)
              : "-"}</small
          >
          <md-linear-progress
            value={dd?.total_storage_mb
              ? Math.max(
                  0,
                  Math.min(1, dd.used_storage_mb / dd.total_storage_mb),
                )
              : 0}
          ></md-linear-progress>
        </div>
      </section>
    </div>

    <section class="home-facts">
      <div class="home-facts__list">
        {#each facts as [icon, label, value, fullValue]}
          {@const copyValue = fullValue ?? value}
          <div class="home-facts__item">
            <div class="home-facts__item-leading">
              <MaterialIcon name={icon} />
            </div>
            <div class="home-facts__item-content">
              <span class="home-facts__item-label">{label}</span>
              <strong class="home-facts__item-value" title={copyValue}
                >{value}</strong
              >
            </div>
            <button
              class="home-facts__item-copy"
              title={m.common_copy()}
              onclick={(e) => {
                e.currentTarget.blur();
                navigator.clipboard.writeText(copyValue);
              }}
            >
              <MaterialIcon name="content_copy" />
            </button>
          </div>
        {/each}
      </div>
    </section>
  </div>

  <section class="home-preview">
    <div
      class="home-preview__body"
      style={devicesState.wallpaperImage && !devicesState.screenshot
        ? `background-image: url('${devicesState.wallpaperImage}'); background-size: cover; background-position: center; position: relative; overflow: hidden;`
        : previewStateHint
          ? "position: relative; z-index: 1; background: var(--surface-container-low);"
          : "position: relative; z-index: 1;"}
    >
      {#if capturing}
        <div class="home-flash"></div>
      {/if}

      {#if devicesState.screenshot}
        <div
          style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; padding: 16px; box-sizing: border-box;"
        >
          <img
            src={devicesState.screenshot}
            alt={m.home_preview_alt()}
            style="max-height: 100%; object-fit: contain; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"
          />

          <div class="home-screenshot-review">
            <md-text-button
              onclick={() => {
                devicesState.screenshot = null;
                autoSavedScreenshotPath = null;
              }}
              disabled={savingScreenshot ? true : undefined}
              title={m.common_cancel()}
            >
              <span slot="icon"><MaterialIcon name="close" size={18} /></span>
              {#if !autoSavedScreenshotPath}
                {m.common_cancel()}
              {/if}
            </md-text-button>

            {#if autoSavedScreenshotPath}
              <md-text-button
                onclick={async () => {
                  try {
                    await invoke("delete_screenshot_auto", { path: autoSavedScreenshotPath! });
                    devicesState.screenshot = null;
                    autoSavedScreenshotPath = null;
                  } catch (e) {
                    actionError = String(e);
                  }
                }}
                disabled={savingScreenshot ? true : undefined}
              >
                <span slot="icon"><MaterialIcon name="delete" size={18} /></span>
                {m.common_erase ? m.common_erase() : 'Borrar'}
              </md-text-button>
              <md-filled-button
                onclick={async () => {
                  try {
                    await invoke("open_screenshot_auto", { path: autoSavedScreenshotPath! });
                  } catch (e) {
                    actionError = String(e);
                  }
                }}
                disabled={savingScreenshot ? true : undefined}
              >
                <span slot="icon"><MaterialIcon name="open_in_new" size={18} /></span>
                {m.common_open ? m.common_open() : 'Abrir'}
              </md-filled-button>
            {:else}
              <md-filled-button
                onclick={saveScreenshotData}
                disabled={savingScreenshot ? true : undefined}
              >
                <span slot="icon">
                  {#if savingScreenshot}
                    <MaterialIcon name="sync" class="home-spin" size={18} />
                  {:else}
                    <MaterialIcon name="save" size={18} />
                  {/if}
                </span>
                {#if savingScreenshot}
                  {m.common_processing()}
                {:else}
                  {m.home_saveCapture()}
                {/if}
              </md-filled-button>
            {/if}
          </div>
        </div>
      {:else if devicesState.wallpaperImage}
        <div
          class="home-lockscreen"
          style={`--home-clock-color: ${themeState.wallpaperClockColor || "#eef3ff"};`}
        >
          <div class="home-lockscreen__scrim"></div>
          <div class="home-lockscreen__top">
            <span
              class="home-lockscreen__operator"
              title={carrierName || undefined}
            >
              {carrierName || "\u00A0"}
            </span>
            <span class="home-lockscreen__date">
              {lockscreenDate}
            </span>
          </div>

          <div class="home-lockscreen__center">
            <div
              class="home-lockscreen__clock"
              aria-label={timeNow.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            >
              <span>{lockscreenTimeParts[0]}</span>
              <span>{lockscreenTimeParts[1]}</span>
            </div>
            <div
              class="home-lockscreen__state"
              style={devicesState.selectedDevice?.state === "device"
                ? "display: none;"
                : ""}
            >
              {#if !devicesState.selectedDevice}
                <MaterialIcon name="phonelink_off" size={16} />
                {m.home_preview_empty_title()}
              {:else if devicesState.selectedDevice.state === "offline"}
                <md-circular-progress
                  indeterminate
                  style="--md-circular-progress-size: 22px;"
                ></md-circular-progress>
                {m.state_connecting ? m.state_connecting() : "Connecting..."}
              {:else if devicesState.selectedDevice.state === "device"}
                <MaterialIcon name="check_circle" size={16} />
                {m.state_connected()}
              {:else}
                <MaterialIcon name={previewStateIcon} size={16} />
                {stateLabel}
              {/if}
            </div>
          </div>

          <md-icon-button
            class="home-wallpaper-download"
            title={m.home_saveWallpaper()}
            onclick={saveWallpaperData}
          >
            <MaterialIcon name="download" size={20} />
          </md-icon-button>

          <md-elevated-button
            class="home-lockscreen__capture"
            onclick={captureScreenshot}
            disabled={capturing ? true : undefined}
            title={m.home_capture()}
          >
            <span slot="icon">
              {#if capturing}
                <MaterialIcon name="sync" class="home-spin" size={18} />
              {:else}
                <MaterialIcon name="screenshot_monitor" size={18} />
              {/if}
            </span>
            {#if capturing}
              {m.common_processing()}
            {:else}
              {m.home_capture()}
            {/if}
          </md-elevated-button>
        </div>
      {:else if !devicesState.selectedDevice}
        <div
          style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px;"
        >
          <MaterialIcon name="phonelink_off" size={48} />
          <strong
            style="margin-top: 16px; font-size: 1.1rem; color: var(--on-surface-variant);"
          >
            {m.home_preview_empty_title()}
          </strong>
        </div>
      {:else if devicesState.selectedDevice.state === "offline"}
        <div
          style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 16px;"
        >
          <md-circular-progress
            indeterminate
            style="--md-circular-progress-size: 48px;"
          ></md-circular-progress>
          <strong
            style="margin-top: 16px; font-size: 1.1rem; color: var(--on-surface-variant);"
          >
            {m.state_connecting ? m.state_connecting() : "Connecting..."}
          </strong>
        </div>
      {:else if devicesState.selectedDevice.state === "device"}
        <div
          style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 32px;"
        >
          <div
            style="display: flex; flex-direction: column; align-items: center;"
          >
            <MaterialIcon name="check_circle" size={48} />
            <strong style="margin-top: 16px; font-size: 1.1rem;"
              >{m.state_connected()}</strong
            >
            <span style="opacity: 0.7; margin-top: 4px;"
              >{devicesState.selectedDevice.model}</span
            >
          </div>

          <md-filled-button
            onclick={captureScreenshot}
            disabled={capturing ? true : undefined}
            title={m.home_capture()}
          >
            <span slot="icon">
              {#if capturing}
                <MaterialIcon name="sync" class="home-spin" size={18} />
              {:else}
                <MaterialIcon name="screenshot_monitor" size={18} />
              {/if}
            </span>
            {#if capturing}
              {m.common_processing()}
            {:else}
              {m.home_capture()}
            {/if}
          </md-filled-button>
        </div>
      {:else if devicesState.selectedDevice.state === "recovery"}
        <div
          style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 16px 0; box-sizing: border-box; gap: 32px;"
        >
          <div
            style="display: flex; flex-direction: column; align-items: center;"
          >
            <MaterialIcon
              name="health_and_safety"
              size={48}
              style="color: var(--md-sys-color-error, #f44336);"
            />
            <strong
              style="margin-top: 16px; font-size: 1.1rem; color: var(--md-sys-color-error, #f44336);"
              >{stateLabel}</strong
            >
            {#if devicesState.selectedDevice.model}
              <span style="opacity: 0.7; margin-top: 4px;"
                >{devicesState.selectedDevice.model}</span
              >
            {/if}

            <div
              style="display: flex; flex-direction: column; gap: 12px; margin-top: 32px; width: 100%; align-items: center;"
            >
              {#if sideloadBusy}
                <div
                  style="width: 250px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px;"
                >
                  <div style="width: 100%;">
                    <div
                      style="margin-bottom: 12px; font-weight: 600; font-size: 1.3rem;"
                    >
                      {sideloadProgress}%
                    </div>
                    <md-linear-progress
                      value={sideloadProgress / 100}
                      style="width: 100%; height: 8px; border-radius: 4px;"
                    ></md-linear-progress>
                  </div>
                  <md-outlined-button
                    onclick={cancelSideload}
                    style="width: 140px;"
                  >
                    {m.common_cancel ? m.common_cancel() : "Cancel"}
                  </md-outlined-button>
                </div>
              {:else}
                <md-filled-button onclick={startSideload} style="width: 220px;">
                  <span slot="icon"
                    ><MaterialIcon name="system_update_alt" size={18} /></span
                  >
                  {m.power_btn_sideload
                    ? m.power_btn_sideload()
                    : "ADB Sideload OTA (.zip)"}
                </md-filled-button>

                <md-filled-tonal-button
                  onclick={rebootFromPreview}
                  style="width: 220px;"
                >
                  <span slot="icon"
                    ><MaterialIcon name="restart_alt" size={18} /></span
                  >
                  {m.power_btn_reboot ? m.power_btn_reboot() : "Reboot system"}
                </md-filled-tonal-button>
              {/if}
            </div>

            {#if actionError}
              <p
                style="margin-top: 16px; width: 90%; font-size: 13px; color: var(--md-sys-color-error); display: flex; align-items: flex-start; gap: 6px; text-align: left; max-height: 120px; overflow-y: auto; white-space: pre-wrap; font-family: monospace; line-height: 1.4;"
              >
                <span style="flex-shrink: 0; margin-top: 2px;"><MaterialIcon name="warning" size={16} /></span>
                {actionError}
              </p>
            {/if}
          </div>

        </div>
      {:else}
        <div
          style="position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 32px;"
        >
          <div
            style="display: flex; flex-direction: column; align-items: center;"
          >
            <MaterialIcon
              name={previewStateIcon}
              size={48}
              style={previewStateColor}
            />
            <strong
              style="margin-top: 16px; font-size: 1.1rem; {previewStateColor}"
              >{stateLabel}</strong
            >
            {#if devicesState.selectedDevice.model}
              <span style="opacity: 0.7; margin-top: 4px;"
                >{devicesState.selectedDevice.model}</span
              >
            {/if}

            {#if previewStateHint}
              <div
                style="margin-top: 24px; font-size: 0.85rem; text-align: center; width: 90%; background: var(--surface-container-high); padding: 12px 16px; border-radius: 12px; border: 1px solid var(--outline-variant); color: var(--on-surface-variant); display: flex; flex-direction: column; gap: 4px; align-items: center; box-sizing: border-box;"
              >
                <span
                  style="display: flex; align-items: center; gap: 6px; font-weight: 500;"
                >
                  <MaterialIcon name="info" size={18} />
                  {m.home_power_confirm_exit
                    ? m.home_power_confirm_exit()
                    : "Exit:"}
                </span>
                <span style="opacity: 0.9;">{previewStateHint}</span>
              </div>
            {/if}
          </div>

          {#if devicesState.selectedDevice.state !== "unauthorized"}
            <md-filled-tonal-button onclick={rebootFromPreview}>
              <span slot="icon"
                ><MaterialIcon name="restart_alt" size={18} /></span
              >
              {m.power_btn_reboot ? m.power_btn_reboot() : "Reboot"}
            </md-filled-tonal-button>
          {/if}
        </div>
      {/if}
    </div>
  </section>

  <PowerDialog
    open={powerOpen}
    busy={powerBusy}
    onClose={() => (powerOpen = false)}
    onAction={performPowerAction}
  />
</main>

<style>
  :global {
    .home-material {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      gap: 24px;
      height: 100%;
      padding: 24px;
      box-sizing: border-box;
      overflow: hidden;
    }
    .home-material__content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: clamp(14px, 1.25vw, 24px);
      min-width: 0;
      overflow-y: auto;
      padding-right: 4px;
    }
    .material-surface {
      position: relative;
      padding: 20px;
      background: var(--surface-container-low);
      border-radius: 24px;
    }
    .home-hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .home-hero > div:first-child {
      flex: 1;
      min-width: 200px;
    }
    .home-hero h2 {
      margin-top: 4px;
      font-size: clamp(20px, 5vw, 30px);
      font-weight: 500;
    }
    .home-hero p {
      margin-top: 4px;
      color: var(--on-surface-variant);
      font-size: clamp(14px, 2vw, 16px);
    }
    .home-hero__actions {
      display: flex;
      flex-shrink: 0;
      align-self: flex-start;
    }
    .home-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .home-power-status {
      position: absolute;
      right: 20px;
      bottom: 10px;
      color: var(--on-surface-variant);
    }
    .home-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: clamp(10px, 1vw, 18px);
    }
    .home-metric {
      display: grid;
      grid-template-columns: clamp(38px, 4cqw, 58px) minmax(0, 1fr);
      gap: clamp(10px, 1.2cqw, 18px);
      min-height: clamp(112px, 11cqw, 168px);
      align-items: center;
      padding: clamp(15px, 1.8cqw, 26px);
    }
    .home-metric > :global(.material-symbols-rounded) {
      color: var(--primary);
      font-size: clamp(28px, 3cqw, 42px);
    }
    .home-metric div {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 4px;
    }
    .home-metric span,
    .home-metric small {
      color: var(--on-surface-variant);
    }
    .home-metric strong {
      font-size: clamp(18px, 2.1cqw, 30px);
    }
    .home-metric md-linear-progress {
      margin-top: 5px;
    }
    .home-preview header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .home-facts {
      display: flex;
      flex-direction: column;
    }
    .home-facts__list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .home-facts__item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      background: var(--surface-container-low);
      border: 1px solid var(--outline-variant);
      border-radius: 16px;
      min-height: 64px;
      box-sizing: border-box;
      transition:
        background-color 0.2s,
        border-color 0.2s;
    }
    .home-facts__item:hover {
      background: var(--surface-container-highest);
      border-color: var(--outline);
    }
    .home-facts__item-leading {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      color: var(--primary);
      background: var(--surface-container-high);
      border-radius: 12px;
    }
    .home-facts__item-leading :global(.material-symbols-rounded) {
      font-size: 22px;
    }
    .home-facts__item-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
      padding-right: 28px;
    }
    .home-material {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      gap: 24px;
      height: 100%;
      padding: 24px;
      box-sizing: border-box;
      overflow: hidden;
    }
    .home-material__content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: clamp(14px, 1.25vw, 24px);
      min-width: 0;
      overflow-y: auto;
      padding-right: 4px;
    }
    .material-surface {
      position: relative;
      padding: 20px;
      background: var(--surface-container-low);
      border-radius: 24px;
    }
    .home-hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .home-hero > div:first-child {
      flex: 1;
      min-width: 200px;
    }
    .home-hero h2 {
      margin-top: 4px;
      font-size: clamp(20px, 5vw, 30px);
      font-weight: 500;
    }
    .home-hero p {
      margin-top: 4px;
      color: var(--on-surface-variant);
      font-size: clamp(14px, 2vw, 16px);
    }
    .home-hero__actions {
      display: flex;
      flex-shrink: 0;
      align-self: flex-start;
    }
    .home-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 16px;
    }
    .home-power-status {
      position: absolute;
      right: 20px;
      bottom: 10px;
      color: var(--on-surface-variant);
    }
    .home-metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: clamp(10px, 1vw, 18px);
    }
    .home-metric {
      display: grid;
      grid-template-columns: clamp(38px, 4cqw, 58px) minmax(0, 1fr);
      gap: clamp(10px, 1.2cqw, 18px);
      min-height: clamp(112px, 11cqw, 168px);
      align-items: center;
      padding: clamp(15px, 1.8cqw, 26px);
    }
    .home-metric > :global(.material-symbols-rounded) {
      color: var(--primary);
      font-size: clamp(28px, 3cqw, 42px);
    }
    .home-metric div {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: 4px;
    }
    .home-metric span,
    .home-metric small {
      color: var(--on-surface-variant);
    }
    .home-metric strong {
      font-size: clamp(18px, 2.1cqw, 30px);
    }
    .home-metric md-linear-progress {
      margin-top: 5px;
    }
    .home-preview header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .home-facts {
      display: flex;
      flex-direction: column;
    }
    .home-facts__list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 12px;
    }
    .home-facts__item {
      position: relative;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      background: var(--surface-container-low);
      border: 1px solid var(--outline-variant);
      border-radius: 16px;
      min-height: 64px;
      box-sizing: border-box;
      transition:
        background-color 0.2s,
        border-color 0.2s;
    }
    .home-facts__item:hover {
      background: var(--surface-container-highest);
      border-color: var(--outline);
    }
    .home-facts__item-leading {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      color: var(--primary);
      background: var(--surface-container-high);
      border-radius: 12px;
    }
    .home-facts__item-leading :global(.material-symbols-rounded) {
      font-size: 22px;
    }
    .home-facts__item-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
      padding-right: 28px;
    }
    .home-facts__item-label {
      font-size: 12px;
      color: var(--on-surface-variant);
      font-weight: 500;
    }
    .home-facts__item-value {
      font-size: 15px;
      color: var(--on-surface);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .home-facts__item-copy {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: transparent;
      border: none;
      border-radius: 50%;
      color: var(--on-surface-variant);
      cursor: pointer;
      opacity: 0;
      transition:
        opacity 0.15s,
        background-color 0.15s,
        color 0.15s;
    }
    .home-facts__item-copy :global(.material-symbols-rounded) {
      font-size: 18px;
    }
    .home-facts__item-copy:hover {
      background: var(--surface-container-high);
      color: var(--primary);
    }
    .home-facts__item:hover .home-facts__item-copy,
    .home-facts__item-copy:focus-visible {
      opacity: 1;
    }
    .home-preview {
      flex: 0.65;
      min-width: 320px;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .home-preview__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
    }
    .home-preview__body {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;
      flex: 1;
      overflow: hidden;
      background: var(--surface-container-lowest);
      border-radius: 28px;
      border: 6px solid var(--surface-container-low);
      container-type: inline-size;
      transition: border-color 150ms ease !important;
    }
    .home-preview__body img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: scale-down;
      object-position: center;
    }
    .home-preview__body > div {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 7px;
      color: var(--on-surface-variant);
      text-align: center;
    }
    .home-preview__body :global(.material-symbols-rounded) {
      font-size: 58px;
    }

    .home-wallpaper-download {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 20;
      pointer-events: auto;
      opacity: 0;
      transition:
        opacity 0.2s,
        background-color 0.2s;
      background: rgba(0, 0, 0, 0.25);
      color: white;
      width: 36px;
      height: 36px;
      --md-icon-button-state-layer-width: 36px;
      --md-icon-button-state-layer-height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(8px);
    }
    .home-preview__body:hover .home-wallpaper-download {
      opacity: 1;
    }
    .home-wallpaper-download:hover {
      background: rgba(0, 0, 0, 0.5);
    }

    .home-flash {
      position: absolute;
      inset: 0;
      background: white;
      z-index: 10;
      pointer-events: none;
      animation: home-flash-anim 0.8s cubic-bezier(0.2, 0, 0, 1) forwards;
    }
    @keyframes home-flash-anim {
      0% {
        opacity: 1;
      }
      100% {
        opacity: 0;
      }
    }

    .home-screenshot-review {
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 12px;
      background: rgba(20, 20, 25, 0.85);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 8px;
      border-radius: 100px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
      z-index: 2;
      width: max-content;
    }
    .home-review-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 20px;
      border-radius: 100px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }
    .home-review-btn.secondary {
      background: transparent;
      color: white;
    }
    .home-review-btn.secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }
    .home-review-btn.primary {
      background: white;
      color: black;
      box-shadow: 0 4px 10px rgba(255, 255, 255, 0.2);
    }
    .home-review-btn.primary:hover {
      background: #f0f0f0;
      transform: scale(1.05);
    }
    .home-review-btn :global(.material-symbols-rounded) {
      font-size: 20px;
    }
    .home-review-btn:disabled {
      opacity: 0.6;
      cursor: wait;
    }

    .home-preview__body > .home-lockscreen {
      position: relative;
      z-index: 1;
      display: block;
      width: 100%;
      height: 100%;
      padding: 24px 18px;
      box-sizing: border-box;
      color: #fff;
      text-align: center;
      text-shadow: 0 3px 16px rgba(0, 0, 0, 0.25);
    }
    .home-lockscreen__scrim {
      position: absolute;
      inset: 0;
      z-index: -1;
      background: linear-gradient(
        180deg,
        rgba(0, 0, 0, 0.45) 0%,
        rgba(0, 0, 0, 0.05) 30%,
        transparent 50%,
        rgba(0, 0, 0, 0.05) 75%,
        rgba(0, 0, 0, 0.35) 100%
      );
    }
    .home-lockscreen__top {
      position: absolute;
      top: 22px;
      left: 26px;
      right: 18px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: flex-start;
      gap: 18px;
      text-align: left;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    }
    .home-lockscreen__operator {
      max-width: min(72%, 240px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 15px;
      font-weight: 450;
      line-height: 1.2;
      letter-spacing: 0;
      opacity: 0.94;
    }
    .home-lockscreen__center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 76px 18px 112px;
      box-sizing: border-box;
      pointer-events: none;
    }
    .home-lockscreen__clock {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: var(--home-clock-color, #eef3ff);
      font-family: var(--font-family);
      font-weight: 450;
      filter: drop-shadow(0 5px 18px rgba(0, 0, 0, 0.25));
      font-variant-numeric: tabular-nums;
    }
    .home-lockscreen__clock span {
      display: block;
      font-size: clamp(80px, 32cqw, 190px);
      line-height: 0.8;
      letter-spacing: -0.02em;
    }
    .home-lockscreen__date {
      max-width: min(78%, 260px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 24px;
      font-weight: 620;
      line-height: 1.25;
      color: rgba(255, 255, 255, 0.94);
      text-transform: capitalize;
    }
    .home-lockscreen__state {
      margin-top: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 32px;
      padding: 6px 12px;
      border-radius: 999px;
      color: rgba(255, 255, 255, 0.94);
      background: rgba(0, 0, 0, 0.18);
      border: 1px solid rgba(255, 255, 255, 0.12);
      backdrop-filter: blur(18px);
      font-size: 13px;
      font-weight: 620;
      line-height: 1.2;
    }
    .home-lockscreen__state :global(.material-symbols-rounded) {
      font-size: 16px;
    }
    .home-lockscreen__capture {
      position: absolute;
      left: 50%;
      bottom: 28px;
      transform: translateX(-50%);
      pointer-events: auto;
    }
    .home-lockscreen__capture :global(.material-symbols-rounded) {
      font-size: 18px;
    }

    @media (min-width: 1300px) {
      .home-facts__list {
        grid-template-columns: repeat(
          auto-fit,
          minmax(clamp(150px, 12cqw, 220px), 1fr)
        );
        gap: clamp(12px, 1.5cqw, 20px);
      }
      .home-facts__item {
        flex-direction: column;
        justify-content: flex-end;
        align-items: flex-start;
        aspect-ratio: 1;
        padding: clamp(16px, 2cqw, 24px);
        border-radius: 20px;
        gap: 8px;
      }
      .home-facts__item-leading {
        margin-bottom: auto;
        width: auto;
        height: auto;
        padding: 12px;
        background: var(--primary-container);
        color: var(--on-primary-container);
        border-radius: 14px;
      }
      .home-facts__item-leading :global(.material-symbols-rounded) {
        font-size: clamp(28px, 3cqw, 40px);
      }
      .home-facts__item-content {
        padding-right: 0;
        gap: 0px;
        width: 100%;
      }
      .home-facts__item-label {
        font-size: clamp(12px, 1.2cqw, 16px);
      }
      .home-facts__item-value {
        font-size: clamp(16px, 1.7cqw, 24px);
      }
      .home-facts__item-copy {
        top: 12px;
        right: 12px;
        transform: none;
      }
      .home-preview {
        flex: 0.8;
        max-width: 500px;
      }
    }
    @media (max-width: 1100px) {
      .home-material {
        flex-direction: column;
        overflow-y: auto;
      }
      .home-material__content {
        overflow: visible;
        padding-right: 0;
        flex: none;
      }
      .home-preview {
        width: 100%;
        max-width: none;
        min-width: 0;
        min-height: 650px;
      }
      .home-lockscreen__clock span {
        font-size: clamp(70px, 18cqw, 140px);
      }
    }
    @media (max-width: 720px) {
      .home-material {
        padding: 12px;
      }
      .home-metrics {
        grid-template-columns: 1fr;
      }
      .home-hero,
      .home-preview header {
        align-items: stretch;
        flex-direction: column;
      }
      .home-hero h2 {
        font-size: clamp(18px, 5vw, 24px);
      }
      .home-hero__actions,
      .home-preview__actions {
        justify-content: flex-end;
      }
      .home-chips {
        gap: 6px;
      }
      .home-lockscreen__clock span {
        font-size: clamp(50px, 16vw, 110px);
      }
    }
    .home-spin {
      animation: home-spin 1s linear infinite;
    }
    @keyframes home-spin {
      100% {
        transform: rotate(360deg);
      }
    }
  }
</style>
