<script lang="ts" module>
  import * as m from "../paraglide/messages";

  export interface AppSettings {
    cache_enabled: boolean;
    cache_path: string;
    kill_adb_on_exit: boolean;
    material_you_enabled: boolean;
    material_you_background_tint: boolean;
  }
</script>

<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { open as openDialog, save } from "@tauri-apps/plugin-dialog";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { getCurrentWebview } from "@tauri-apps/api/webview";

  import type {
    AppSummary,
    AppDetailsInfo,
    AppPermissionInfo,
    AppFilter,
    StorageSizes,
  } from "./workbench/types";
  import { devicesState } from "../context/devices.svelte";
  import { operationsState } from "../context/operations.svelte";
  import MaterialIcon from "../components/MaterialIcon.svelte";
  import { materialTextFieldValue } from "../actions/materialTextFieldValue";
  import { appTone, formatBytes, translateError } from "./workbench/utils";
  import VirtualGrid from "../components/VirtualGrid.svelte";
  import { getDebloatInfo } from "../utils/debloat";
  let {
    serial,
    status = $bindable(),
    busy = $bindable(),
    scrcpy,
    tab,
    appSettings,
    javaAvailable,
  } = $props<{
    serial: string;
    status: string;
    busy: boolean;
    scrcpy?: (args: string[]) => Promise<void>;
    tab: string;
    appSettings: AppSettings | null;
    javaAvailable: boolean;
  }>();

  async function runQuiet(args: string[]) {
    try {
      return await invoke<string>("run_device_action", { serial, args });
    } catch (error: any) {
      status = translateError(error);
      return undefined;
    }
  }

  let apps = $state.raw<AppSummary[]>([]);
  let appDetails = $state.raw<AppDetailsInfo | null>(null);
  let metadataLoading = $state(false);
  let attemptedMetadata = $state(false);
  let detailsLoading = $state(false);
  let apkmirrorUrl = $state<string | null>(null);
  let apkmirrorSearched = $state(false);
  let installOpen = $state(false);
  let installFiles = $state<string[]>([]);

  let installReplace = $state(true);
  let installGrant = $state(true);
  let installTest = $state(true);
  let installBypass = $state(false);
  let filter = $state<"all" | "user" | "system" | "disabled" | "uninstalled" | "debloat">("user");
  let appFilter = $state("");
  let selectedPackage = $state("");
  let destructiveAction = $state<"uninstall" | "clear-data" | null>(null);
  let destructiveBusy = $state(false);
  let osDragHover = $state(false);
  let permissionUpdating = $state<Record<string, boolean>>({});

  let scrcpyAnchorElement: HTMLElement | undefined = $state();
  let scrcpyMenuElement: any | undefined = $state();
  let supportsFlex = $derived(
    !!scrcpy &&
      parseInt(devicesState.deviceDetails?.api_level || "0", 10) >= 29,
  );

  function toggleScrcpyMenu() {
    if (!scrcpyMenuElement || !scrcpyAnchorElement) return;
    scrcpyMenuElement.anchorElement = scrcpyAnchorElement;
    if (scrcpyMenuElement.open) {
      scrcpyMenuElement.close();
    } else {
      scrcpyMenuElement.show();
    }
  }

  let filteredApps = $derived.by(() => {
    let result = apps;
    if (filter === "user") result = result.filter((app) => !app.system_app);
    if (filter === "system") result = result.filter((app) => app.system_app);
    if (filter === "disabled") result = result.filter((app) => app.disabled && !app.uninstalled);
    if (filter === "uninstalled") result = result.filter((app) => app.uninstalled);
    if (filter === "debloat") {
      result = result.filter((app) => {
        if (!app.system_app || app.disabled || app.uninstalled) return false;
        const info = getDebloatInfo(app.package_name);
        return info !== undefined;
      });
    }
    if (appFilter) {
      const lower = appFilter.toLowerCase();
      result = result.filter(
        (app) =>
          app.display_name.toLowerCase().includes(lower) ||
          app.package_name.toLowerCase().includes(lower),
      );
    }
    return result;
  });

  let appsNeedingMetadata = $derived(
    filteredApps.filter((app) => !app.icon_data_url),
  );
  let grantedPermissionCount = $derived(
    appDetails?.permissions.filter((permission) => permission.granted).length ??
      0,
  );
  let sortedPermissions = $derived.by(() =>
    [...(appDetails?.permissions ?? [])].sort((a, b) => {
      if (a.changeable !== b.changeable) return a.changeable ? -1 : 1;
      if (a.runtime !== b.runtime) return a.runtime ? -1 : 1;
      return a.name.localeCompare(b.name);
    }),
  );

  async function refreshApps(forceRefresh = false) {
    if (!serial) return;
    busy = true;
    attemptedMetadata = false;
    try {
      const value = await invoke<AppSummary[]>("list_apps", {
        serial,
        forceRefresh,
      });
      apps = value;
      status = "";
    } catch (error) {
      status = String(error);
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    if (tab === "apps" && serial && !apps.length) refreshApps();
  });

  $effect(() => {
    if (
      tab === "apps" &&
      appSettings &&
      !appSettings.cache_enabled &&
      appsNeedingMetadata.length > 0 &&
      !metadataLoading &&
      !attemptedMetadata
    ) {
      attemptedMetadata = true;
      loadVisibleMetadata();
    }
  });

  $effect(() => {
    // This effect runs when filter or tab changes
    filter;
    tab;
    attemptedMetadata = false;
  });

  async function refreshAppDetails(
    packageName = selectedPackage,
    showLoading = true,
  ) {
    if (!serial || !packageName) return;
    if (showLoading) detailsLoading = true;
    try {
      const value = await invoke<AppDetailsInfo>("get_app_details", {
        serial,
        packageName,
      });
      const summary = apps.find((app) => app.package_name === packageName);

      const hasRequestInstall = value.permissions.some(
        (p) => p.name === "android.permission.REQUEST_INSTALL_PACKAGES",
      );

      appDetails =
        appDetails?.package_name === packageName
          ? {
              ...value,
              uninstalled: summary?.uninstalled || false,
              display_name:
                summary && summary.display_name !== summary.package_name
                  ? summary.display_name
                  : value.display_name,
              icon_data_url: summary?.icon_data_url || value.icon_data_url,
            }
          : appDetails;

      apps = apps.map((app) =>
        app.package_name === packageName
          ? {
              ...app,
              display_name:
                value.display_name !== value.package_name
                  ? value.display_name
                  : app.display_name,
              disabled: value.disabled,
              system_app: value.system_app,
              icon_data_url: value.icon_data_url || app.icon_data_url,
            }
          : app,
      );

      invoke<StorageSizes>("get_app_storage_sizes", { serial, packageName })
        .then((sizes) => {
          if (appDetails?.package_name === packageName) {
            appDetails = {
              ...appDetails,
              data_size_bytes: sizes.data_size_bytes,
              cache_size_bytes: sizes.cache_size_bytes,
            };
          }
        })
        .catch(() => {});
    } catch (error) {
      status = String(error);
    } finally {
      if (showLoading) detailsLoading = false;
    }
  }

  async function selectApplication(app: AppSummary) {
    if (selectedPackage === app.package_name) {
      selectedPackage = "";
      appDetails = null;
      return;
    }
    selectedPackage = app.package_name;
    apkmirrorSearched = false;
    apkmirrorUrl = null;
    invoke<string | null>("search_apkmirror", { packageName: selectedPackage })
      .then((res) => {
        if (selectedPackage === app.package_name) {
          apkmirrorUrl = res;
          apkmirrorSearched = true;
        }
      })
      .catch(() => {
        if (selectedPackage === app.package_name) {
          apkmirrorUrl = null;
          apkmirrorSearched = true;
        }
      });
    appDetails = {
      ...app,
      is_split: false,
      version_name: "-",
      version_code: "-",
      target_sdk: "-",
      min_sdk: "-",
      installer: "-",
      data_dir: "-",
      code_size_bytes: -1,
      data_size_bytes: -1,
      cache_size_bytes: -1,
      background_mode: "optimized",
      permissions: [],
      install_date: "-",
      update_date: "-",
    } as AppDetailsInfo;
    void refreshAppDetails(app.package_name);
  }

  async function loadVisibleMetadata() {
    if (!serial || !appsNeedingMetadata.length || metadataLoading) return;
    metadataLoading = true;
    if (tab === "apps") {
      status = m.workbench_status_metadataLoading({
        count: appsNeedingMetadata.length,
      });
    }
    let loaded = 0;
    let failed = 0;
    const currentFilter = filter;
    const snapshot = [...appsNeedingMetadata];
    try {
      for (let start = 0; start < snapshot.length; start += 200) {
        if (
          filter !== currentFilter ||
          (!appSettings?.cache_enabled && tab !== "apps")
        ) {
          break;
        }
        const batch = snapshot.slice(start, start + 200);
        const summaries = await invoke<AppSummary[]>("enrich_app_summaries", {
          serial,
          requests: batch.map((app) => ({
            package_name: app.package_name,
            apk_path: app.apk_path,
            system_app: app.system_app,
            disabled: app.disabled,
            uninstalled: app.uninstalled,
          })),
        }).catch(() => []);

        loaded += summaries.length;
        failed += batch.length - summaries.length;

        if (summaries.length > 0) {
          const summaryMap = new Map(summaries.map((s) => [s.package_name, s]));
          apps = apps.map((app) => summaryMap.get(app.package_name) || app);

          if (appDetails) {
            const summary = summaryMap.get(appDetails.package_name);
            if (summary) {
              appDetails = {
                ...appDetails,
                display_name: summary.display_name,
                icon_data_url: summary.icon_data_url,
              };
            }
          }
        }

        if (tab === "apps") {
          status = m.workbench_status_metadataProgress({
            processed: Math.min(start + batch.length, snapshot.length),
            total: snapshot.length,
          });
        }
      }
      if (tab === "apps") {
        status = failed ? m.workbench_status_metadataFailed({ failed }) : "";
      }
    } finally {
      metadataLoading = false;
    }
  }

  async function chooseInstallFiles() {
    try {
      const selected = await openDialog({
        title: m.apps_action_install(),
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Android Packages",
            extensions: ["apk", "apks", "apkm", "xapk", "zip", "aab"],
          },
        ],
      });
      const selectedFiles = Array.isArray(selected)
        ? selected
        : selected
          ? [selected]
          : [];
      if (selectedFiles.length) {
        installFiles = [...new Set([...installFiles, ...selectedFiles])];
      }
    } catch (error) {
      status = String(error);
    }
  }

  function installSelectedApps() {
    if (!installFiles.length) return;

    const options = {
      replace: installReplace,
      grant: installGrant,
      test: installTest,
      bypass: installBypass,
    };

    for (const file of installFiles) {
      const name = file.split(/[\\/]/).pop() || file;
      operationsState.enqueue(
        "install",
        file,
        JSON.stringify(options),
        name,
        false,
      );
    }

    installOpen = false;
    installFiles = [];
    operationsState.isOpen = true;
  }

  async function toggleAppEnabled() {
    if (!appDetails) return;
    try {
      const willDisable = !appDetails.disabled;
      const command = willDisable
        ? ["shell", "pm", "disable-user", "--user", "0", selectedPackage]
        : ["shell", "pm", "enable", "--user", "0", selectedPackage];
      const result = await runQuiet(command);
      if (result === undefined) return;

      appDetails = { ...appDetails, disabled: willDisable };
      apps = apps.map((app) =>
        app.package_name === selectedPackage
          ? { ...app, disabled: willDisable }
          : app,
      );
    } catch (e) {
      status = String(e);
    }
  }

  async function reinstallApplication() {
    try {
      await invoke("reinstall_app", {
        serial,
        packageName: selectedPackage,
      });
      status = m.workbench_status_appEnabled();
      appDetails = null;
      selectedPackage = "";
      await refreshApps(true);
    } catch (e) {
      status = String(e);
    }
  }

  async function setBackgroundMode(
    mode: "unrestricted" | "optimized" | "restricted",
  ) {
    if (!selectedPackage) return;
    const values =
      mode === "unrestricted"
        ? ["allow", "allow"]
        : mode === "restricted"
          ? ["ignore", "ignore"]
          : ["default", "default"];
    await runQuiet([
      "shell",
      `cmd appops set ${selectedPackage} RUN_ANY_IN_BACKGROUND ${values[0]} ; cmd appops set ${selectedPackage} RUN_IN_BACKGROUND ${values[1]}`,
    ]);
    await refreshAppDetails();
  }

  async function setPermission(
    permission: AppPermissionInfo,
    nextGranted: boolean,
  ) {
    if (!permission.changeable) return;
    if (!selectedPackage || permissionUpdating[permission.name]) return;
    const previousGranted = permission.granted;
    if (previousGranted === nextGranted) return;
    permissionUpdating = { ...permissionUpdating, [permission.name]: true };
    if (appDetails) {
      appDetails = {
        ...appDetails,
        permissions: appDetails.permissions.map((item) =>
          item.name === permission.name
            ? { ...item, granted: nextGranted }
            : item,
        ),
      };
    }
    try {
      if (permission.name === "android.permission.REQUEST_INSTALL_PACKAGES") {
        const result = await runQuiet([
          "shell",
          "appops",
          "set",
          selectedPackage,
          "REQUEST_INSTALL_PACKAGES",
          nextGranted ? "allow" : "deny",
        ]);
        if (result === undefined) throw new Error("Command failed");
      } else {
        await invoke<string>("set_app_permission", {
          serial,
          packageName: selectedPackage,
          permissionName: permission.name,
          grant: nextGranted,
        });
      }
      await refreshAppDetails(selectedPackage, false);
    } catch (error) {
      status = String(error);
      if (appDetails) {
        appDetails = {
          ...appDetails,
          permissions: appDetails.permissions.map((item) =>
            item.name === permission.name
              ? { ...item, granted: previousGranted }
              : item,
          ),
        };
      }
    } finally {
      const next = { ...permissionUpdating };
      delete next[permission.name];
      permissionUpdating = next;
    }
  }

  async function exportApk() {
    if (!appDetails) return;
    try {
      const isSplit = appDetails.is_split;
      const extension = isSplit ? "apks" : "apk";
      const destination = await save({
        title: m.apps_action_saveApk(),
        defaultPath: `${appDetails.package_name}.${extension}`,
        filters: [{ name: "Android Package", extensions: [extension] }],
      });
      if (destination) {
        status = m.workbench_status_exporting({ path: destination });
        await invoke("export_apk", {
          serial,
          packageName: appDetails.package_name,
          destination,
        });
        status = m.workbench_status_apkSaved({ path: destination });
      }
    } catch (error) {
      status = String(error);
    }
  }

  async function openApkMirror() {
    if (apkmirrorUrl) {
      await openUrl(apkmirrorUrl);
    } else if (selectedPackage) {
      const appName =
        appDetails?.display_name && appDetails.display_name !== selectedPackage
          ? `${appDetails.display_name} `
          : "";
      await openUrl(
        `https://www.google.com/search?q=${encodeURIComponent(appName + selectedPackage + " apk")}`,
      );
    }
  }

  async function openAppInfo() {
    if (!selectedPackage) return;
    await runQuiet([
      "shell",
      "am",
      "start",
      "-a",
      "android.settings.APPLICATION_DETAILS_SETTINGS",
      "-d",
      `package:${selectedPackage}`,
    ]);
  }

  async function performDestructiveAppAction() {
    if (!destructiveAction || !selectedPackage) return;
    destructiveBusy = true;
    try {
      if (destructiveAction === "uninstall") {
        if (appDetails?.system_app) {
          await runQuiet([
            "shell",
            "pm",
            "uninstall",
            "-k",
            "--user",
            "0",
            selectedPackage,
          ]);
        } else {
          await runQuiet(["uninstall", selectedPackage]);
        }
        status = m.workbench_status_appUninstalled();
        selectedPackage = "";
        appDetails = null;
        await refreshApps(true);
      } else {
        await runQuiet(["shell", "pm", "clear", selectedPackage]);
        status = m.workbench_status_appDataCleared();
        await refreshAppDetails();
      }
      destructiveAction = null;
    } finally {
      destructiveBusy = false;
    }
  }

  async function openAppInScrcpy(
    pkg: string,
    mode: "flex" | "normal" = "flex",
  ) {
    status = m.workbench_status_launchingApp({ pkg });
    try {
      // Asegurarnos de que la pantalla está encendida; los virtual displays a veces no renderizan si el móvil está en reposo profundo.
      await runQuiet(["shell", "input", "keyevent", "KEYCODE_WAKEUP"]);

      // Android 10 (API 29) es la versión mínima segura para el modo flex / virtual displays.
      if (supportsFlex && mode === "flex" && scrcpy) {
        await scrcpy(["--new-display", "--flex-display", `--start-app=${pkg}`]);
      } else {
        await runQuiet([
          "shell",
          "monkey",
          "-p",
          pkg,
          "-c",
          "android.intent.category.LAUNCHER",
          "1",
        ]);
        if (scrcpy) await scrcpy([]);
      }
    } catch (e) {
      status = String(e);
    }
  }

  let filters = $derived<
    Array<["user" | "all" | "system" | "disabled" | "uninstalled" | "debloat", string, string]>
  >([
    ["user", m.apps_filter_user(), "person"],
    ["all", m.apps_filter_all(), "apps"],
    ["system", m.apps_filter_system(), "settings"],
    ["disabled", m.apps_filter_disabled(), "block"],
    ["uninstalled", m.apps_filter_uninstalled(), "delete"],
    ["debloat", m.apps_filter_debloat(), "cleaning_services"],
  ]);

  let pending = $derived(
    filteredApps.filter(
      (app) => !app.icon_data_url || app.display_name === app.package_name,
    ).length,
  );
  const count = (value: string) =>
    apps.filter((app) =>
      value === "all"
        ? true
        : value === "disabled"
          ? app.disabled && !app.uninstalled
          : value === "uninstalled"
            ? app.uninstalled
            : value === "system"
              ? app.system_app && !app.disabled && !app.uninstalled
              : value === "debloat"
                ? (() => {
                    if (!app.system_app || app.disabled || app.uninstalled) return false;
                  const info = getDebloatInfo(app.package_name);
                  return info && (info.removal === "delete" || info.removal === "replace" || info.removal === "caution");
                })()
              : !app.system_app && !app.disabled && !app.uninstalled,
    ).length;

  $effect(() => {
    let unlisten: (() => void) | undefined;
    let isMounted = true;

    if (tab === "apps") {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type === "over" || event.payload.type === "enter") {
            osDragHover = true;
          } else if (event.payload.type === "leave") {
            osDragHover = false;
          } else if (event.payload.type === "drop") {
            osDragHover = false;
            const paths = (event.payload as any).paths || [];
            const apks = paths.filter((p: string) =>
              /\.(apk|apks|xapk|apkm|aab|zip)$/i.test(p),
            );
            if (apks.length > 0) {
              installFiles = [...new Set([...installFiles, ...apks])];
              installOpen = true;
            }
          }
        })
        .then((fn) => {
          unlisten = fn;
          if (!isMounted) unlisten();
        });
    }

    return () => {
      isMounted = false;
      if (unlisten) unlisten();
    };
  });
</script>

<div class="apps-material-host {osDragHover ? 'os-drag-hover' : ''}">
  {#if osDragHover}
    <div
      class="file-os-drag-overlay"
      style="position: absolute; inset: 0; z-index: 100; background: rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; gap: 16px; border-radius: 24px; backdrop-filter: blur(4px);"
    >
      <MaterialIcon name="install_mobile" size={64} />
      <span style="font-size: 24px; font-weight: 500;"
        >{m.apps_action_install()}</span
      >
    </div>
  {/if}
  <div class="apps-material-page {selectedPackage ? 'detail-open' : ''}">
    <section class="apps-material-catalog">
      <header class="apps-material-toolbar">
        <md-outlined-text-field
          class="apps-material-search"
          label={m.apps_search_placeholder()}
          use:materialTextFieldValue={appFilter}
          oninput={(event: Event) =>
            (appFilter = (event.target as HTMLInputElement).value)}
        >
          <MaterialIcon slot="leading-icon" name="search" />
          {#if appFilter}
            <md-icon-button
              slot="trailing-icon"
              onclick={() => (appFilter = "")}
            >
              <MaterialIcon name="close" />
            </md-icon-button>
          {/if}
        </md-outlined-text-field>

        {#if appSettings?.cache_enabled && pending > 0}
          <md-filled-tonal-button
            disabled={metadataLoading ? true : undefined}
            onclick={loadVisibleMetadata}
          >
            <MaterialIcon slot="icon" name="image_search" />
            {metadataLoading
              ? m.common_loading()
              : m.apps_action_loadMetadata({ pending })}
          </md-filled-tonal-button>
        {/if}

        <md-icon-button
          aria-label={m.apps_action_refresh()}
          title={m.apps_action_refresh()}
          onclick={() => refreshApps(true)}
        >
          <MaterialIcon name="refresh" />
        </md-icon-button>
        <md-filled-icon-button
          aria-label={m.apps_action_install()}
          title={m.apps_action_install()}
          onclick={() => (installOpen = true)}
        >
          <MaterialIcon name="add" />
        </md-filled-icon-button>
      </header>

      <nav class="apps-material-filters">
        {#each filters as [value, label, icon] (value)}
          <button
            class={filter === value ? "active" : ""}
            onclick={() => (filter = value)}
          >
            <MaterialIcon name={icon} filled={filter === value} />
            <span>{label}</span>
            <strong>{count(value)}</strong>
            <md-ripple></md-ripple>
          </button>
        {/each}
      </nav>

      {#snippet appTile(app: import("./workbench/types").AppSummary)}
        <button
          class="apps-material-tile {selectedPackage === app.package_name ? 'selected' : ''}"
          style="width: 100%; height: 100%; position: relative;"
          onclick={() => selectApplication(app)}
          ondblclick={() => openAppInScrcpy(app.package_name)}
        >
          <div
            class="apps-material-status-icon {app.uninstalled ? 'uninstalled' : app.disabled ? 'disabled' : ''}"
            title={app.uninstalled ? m.apps_filter_uninstalled() : app.disabled ? m.apps_status_disabled() : app.system_app ? m.apps_status_system() : m.apps_status_user()}
          >
            <MaterialIcon name={app.uninstalled ? "delete" : app.disabled ? "block" : app.system_app ? "settings" : "person"} />
          </div>
          <span class="app-icon-frame">
            {#if app.icon_data_url}
              <img src={app.icon_data_url} alt="" decoding="async" />
            {:else}
              <span class="app-fallback {appTone(app.package_name)}">{app.display_name.slice(0, 2).toUpperCase()}</span>
            {/if}
          </span>
          <span class="apps-material-tile__copy">
            <strong>{app.display_name}</strong>
            <small>{app.package_name}</small>
          </span>
          <md-ripple></md-ripple>
        </button>
      {/snippet}

      <div
        class="apps-material-grid-container"
        style="flex: 1; min-height: 0; padding: 12px; box-sizing: border-box;"
      >
        {#if filter === "debloat"}
          <div class="debloat-grouped-view" style="display: flex; flex-direction: column; gap: 24px; padding-bottom: 24px; overflow-y: auto; height: 100%; padding-right: 4px;">
            {#each ["delete", "replace", "caution", "unsafe"] as rType}
              {@const groupApps = filteredApps.filter(a => getDebloatInfo(a.package_name)?.removal === rType)}
              {#if groupApps.length > 0}
                <div class="debloat-group">
                  <header style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 0; color: var(--on-surface); position: sticky; top: 0; z-index: 10; background: var(--surface-container-low);">
                    <MaterialIcon name={rType === 'delete' ? 'delete' : rType === 'replace' ? 'help_outline' : 'block'} />
                    <h3 style="margin: 0; font-size: 16px; font-weight: 600;">{(m as any)[`apps_debloat_removal_${rType}`]()}</h3>
                    <span style="margin-left: auto; background: var(--surface-container-highest); padding: 2px 8px; border-radius: 99px; font-size: 12px; font-weight: bold;">{groupApps.length}</span>
                  </header>
                  <div class="apps-material-grid" style="overflow: visible; padding: 0;">
                    {#each groupApps as app (app.package_name)}
                      <div style="height: 190px;">
                        {@render appTile(app)}
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}
            {#if !filteredApps.length}
              <div class="apps-material-empty">
                <MaterialIcon name="search_off" />
                <strong>{m.apps_empty_title()}</strong>
                <span>{m.apps_empty_subtitle()}</span>
              </div>
            {/if}
          </div>
        {:else}
          <VirtualGrid
            items={filteredApps}
            itemHeight={190}
            minItemWidth={155}
            gap={10}
            key={(app) => app.package_name}
          >
            {#snippet row(app)}
              {@render appTile(app)}
            {/snippet}
          </VirtualGrid>
          {#if !filteredApps.length}
            <div class="apps-material-empty">
              <MaterialIcon name="search_off" />
              <strong>{m.apps_empty_title()}</strong>
              <span>{m.apps_empty_subtitle()}</span>
            </div>
          {/if}
        {/if}
      </div>
    </section>

    <aside class="apps-material-detail">
      {#if !appDetails}
        <div class="apps-material-empty detail">
          <MaterialIcon name="touch_app" />
          <strong>{m.apps_detail_empty_title()}</strong>
          <span>{m.apps_detail_empty_subtitle()}</span>
        </div>
      {:else}
        <md-text-button
          class="apps-material-back"
          onclick={() => {
            selectedPackage = "";
            appDetails = null;
          }}
        >
          <MaterialIcon slot="icon" name="arrow_back" />
          {m.nav_apps()}
        </md-text-button>

        <header class="apps-material-detail__hero" style="position: relative">
          <span class="app-icon-frame">
            {#if appDetails.icon_data_url}
              <img src={appDetails.icon_data_url} alt="" />
            {:else}
              <span class="app-fallback {appTone(appDetails.package_name)}"
                >{appDetails.display_name.slice(0, 2).toUpperCase()}</span
              >
            {/if}
          </span>
          <div style="flex: 1; min-width: 0; padding-right: 130px">
            <h2>{appDetails.display_name}</h2>
            <p>{appDetails.package_name}</p>
            <div
              class="apps-material-status-icon {appDetails.uninstalled ? 'uninstalled' : appDetails.disabled
                ? 'disabled'
                : ''}"
              title={appDetails.uninstalled ? m.apps_filter_uninstalled() : appDetails.disabled
                ? m.apps_status_disabled()
                : appDetails.system_app
                  ? m.apps_detail_type_system()
                  : m.apps_detail_type_user()}
            >
              <MaterialIcon
                name={appDetails.uninstalled ? "delete" : appDetails.disabled
                  ? "block"
                  : appDetails.system_app
                    ? "settings"
                    : "person"}
              />
            </div>
          </div>
          <div style="position: absolute; top: 0; right: 0">
            <md-text-button
              bind:this={scrcpyAnchorElement}
              onclick={() => {
                if (supportsFlex) {
                  toggleScrcpyMenu();
                } else {
                  openAppInScrcpy(appDetails!.package_name, "normal");
                }
              }}
            >
              <MaterialIcon slot="icon" name="desktop_windows" />
              {m.apps_action_openScrcpy()}
              {#if supportsFlex}
                <MaterialIcon
                  name="arrow_drop_down"
                  style="margin-left: 4px; font-size: 18px;"
                />
              {/if}
            </md-text-button>
            {#if supportsFlex}
              <md-menu
                bind:this={scrcpyMenuElement}
                positioning="popover"
                anchorCorner="end-end"
                menuCorner="start-end"
              >
                <md-menu-item
                  onclick={() => {
                    openAppInScrcpy(appDetails!.package_name, "flex");
                    scrcpyMenuElement?.close();
                  }}
                >
                  <div slot="headline">{m.apps_action_openScrcpy_flex()}</div>
                </md-menu-item>
                <md-menu-item
                  onclick={() => {
                    openAppInScrcpy(appDetails!.package_name, "normal");
                    scrcpyMenuElement?.close();
                  }}
                >
                  <div slot="headline">{m.apps_action_openScrcpy_normal()}</div>
                </md-menu-item>
              </md-menu>
            {/if}
          </div>
        </header>

        {#if getDebloatInfo(appDetails.package_name)}
          {@const info = getDebloatInfo(appDetails.package_name)!}
          <section class="apps-material-section">
            <header>
              <span class="apps-material-section__title">
                <MaterialIcon name="cleaning_services" />
                <h3>{m.apps_filter_debloat()}</h3>
              </span>
            </header>
            <div class="apps-material-debloat {info.removal}">
               <strong>{m.apps_debloat_removal({ removal: (m as any)[`apps_debloat_removal_${info.removal}`]() })}</strong>
               <p>{info.description}</p>
               {#if info.warning}
                 <p class="warning"><strong>{m.apps_debloat_removal_caution()}</strong>: {info.warning}</p>
               {/if}
            </div>
          </section>
        {/if}

        <section class="apps-material-section">
          <header>
            <span class="apps-material-section__title">
              <MaterialIcon name="bolt" />
              <h3>{m.apps_detail_actions()}</h3>
            </span>
          </header>
          <div class="apps-material-actions">
            {#if appDetails.uninstalled}
              <md-filled-button onclick={reinstallApplication}>
                <MaterialIcon slot="icon" name="system_update_alt" />
                {m.apps_action_reinstall()}
              </md-filled-button>
            {:else}
              <md-filled-button
                onclick={async () => {
                  await runQuiet([
                    "shell",
                    "monkey",
                    "-p",
                    selectedPackage,
                    "-c",
                    "android.intent.category.LAUNCHER",
                    "1",
                  ]);
                }}
              >
                <MaterialIcon slot="icon" name="open_in_new" />
                {m.apps_action_open()}
              </md-filled-button>
              <md-filled-tonal-button
                onclick={() =>
                  runQuiet(["shell", "am", "force-stop", selectedPackage])}
              >
                <MaterialIcon slot="icon" name="stop_circle" />
                {m.apps_action_stop()}
              </md-filled-tonal-button>
              <md-filled-tonal-button onclick={toggleAppEnabled}>
                <MaterialIcon
                  slot="icon"
                  name={appDetails.disabled ? "check_circle" : "block"}
                />
                {appDetails.disabled
                  ? m.apps_action_enable()
                  : m.apps_action_disable()}
              </md-filled-tonal-button>
              <md-filled-tonal-button onclick={openAppInfo}>
                <MaterialIcon slot="icon" name="info" />
                {m.apps_action_appInfo()}
              </md-filled-tonal-button>
              <md-outlined-button
                onclick={() => (destructiveAction = "clear-data")}
              >
                <MaterialIcon slot="icon" name="delete_sweep" />
                {m.common_clearData()}
              </md-outlined-button>
              <md-outlined-button
                class="apps-material-danger"
                onclick={() => (destructiveAction = "uninstall")}
              >
                <MaterialIcon slot="icon" name="delete_forever" />
                {m.apps_action_uninstall()}
              </md-outlined-button>
            {/if}
            <md-filled-tonal-button onclick={exportApk}>
              <MaterialIcon slot="icon" name="download" />
              {m.apps_action_saveApk()}
            </md-filled-tonal-button>
            <md-filled-tonal-button
              onclick={openApkMirror}
              disabled={!apkmirrorSearched || undefined}
            >
              <MaterialIcon
                slot="icon"
                name={apkmirrorUrl ? "public" : "search"}
              />
              {#if !apkmirrorSearched}
                <md-circular-progress
                  indeterminate
                  style="--md-circular-progress-size: 18px; margin-right: 4px;"
                ></md-circular-progress>
              {/if}
              {apkmirrorUrl
                ? m.apps_action_viewApkMirror()
                : m.apps_action_searchWeb()}
            </md-filled-tonal-button>
          </div>
        </section>

        {#if detailsLoading}
          <div class="apps-material-section-loader" style="padding: 60px 0">
            <md-circular-progress indeterminate></md-circular-progress>
          </div>
        {:else}
          <section class="apps-material-section">
            <header>
              <span class="apps-material-section__title">
                <MaterialIcon name="battery_android_frame_full" />
                <h3>{m.apps_detail_energy()}</h3>
              </span>
            </header>
            <div class="apps-material-energy">
              {#each [["unrestricted", m.apps_energy_unrestricted(), "speed"], ["optimized", m.apps_energy_optimized(), "eco"], ["restricted", m.apps_energy_restricted(), "battery_saver"]] as [value, label, icon]}
                <button
                  class={appDetails.background_mode === value ? "active" : ""}
                  onclick={() =>
                    setBackgroundMode(
                      value as "unrestricted" | "optimized" | "restricted",
                    )}
                >
                  <MaterialIcon name={String(icon)} />
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {value === "unrestricted"
                        ? m.apps_energy_unrestricted_desc()
                        : value === "optimized"
                          ? m.apps_energy_optimized_desc()
                          : m.apps_energy_restricted_desc()}
                    </small>
                  </span>
                  <md-ripple></md-ripple>
                </button>
              {/each}
            </div>
          </section>

          <section class="apps-material-section">
            <header>
              <span class="apps-material-section__title">
                <MaterialIcon name="info" />
                <h3>{m.apps_detail_info()}</h3>
              </span>
            </header>
            <dl class="apps-material-info">
              <div>
                <dt>{m.apps_info_version()}</dt>
                <dd>{appDetails.version_name} ({appDetails.version_code})</dd>
              </div>
              <div>
                <dt>{m.apps_info_installDate()}</dt>
                <dd>{appDetails.install_date}</dd>
              </div>
              <div>
                <dt>{m.apps_info_updateDate()}</dt>
                <dd>{appDetails.update_date}</dd>
              </div>
              <div>
                <dt>{m.apps_info_targetSdk()}</dt>
                <dd>{appDetails.target_sdk}</dd>
              </div>
              <div>
                <dt>{m.apps_info_minSdk()}</dt>
                <dd>{appDetails.min_sdk}</dd>
              </div>
              <div>
                <dt>{m.apps_info_installer()}</dt>
                <dd>{appDetails.installer}</dd>
              </div>
              <div>
                <dt>{m.apps_info_apkSize()}</dt>
                <dd>{formatBytes(appDetails.code_size_bytes)}</dd>
              </div>
              <div>
                <dt>{m.apps_info_dataSize()}</dt>
                <dd>{formatBytes(appDetails.data_size_bytes)}</dd>
              </div>
              <div>
                <dt>{m.apps_info_cacheSize()}</dt>
                <dd>{formatBytes(appDetails.cache_size_bytes)}</dd>
              </div>
              <div class="wide">
                <dt>{m.apps_info_apkPath()}</dt>
                <dd>{appDetails.apk_path}</dd>
              </div>
              <div class="wide">
                <dt>{m.apps_info_dataPath()}</dt>
                <dd>{appDetails.data_dir}</dd>
              </div>
            </dl>
          </section>

          <section class="apps-material-section">
            <header>
              <span class="apps-material-section__title">
                <MaterialIcon name="shield" />
                <h3>{m.apps_detail_permissions()}</h3>
              </span>
              <span class="apps-material-section__meta">
                <span
                  >{m.apps_permissions_count({
                    granted: grantedPermissionCount,
                    total: appDetails.permissions.length,
                  })}</span
                >
              </span>
            </header>
            <div class="apps-material-permissions">
              {#each sortedPermissions as permission (permission.name)}
                <div>
                  <span>
                    <strong>{permission.name.split(".").pop()}</strong>
                    <small>{permission.name}</small>
                  </span>
                  <md-switch
                    {...permission.granted ? { selected: true } : {}}
                    {...!permission.changeable ||
                    permissionUpdating[permission.name]
                      ? { disabled: true }
                      : {}}
                    title={permission.changeable
                      ? m.apps_permission_changeable()
                      : m.apps_permission_readonly()}
                    onchange={(event: Event) =>
                      setPermission(
                        permission,
                        Boolean(
                          (
                            event.currentTarget as HTMLElement & {
                              selected?: boolean;
                            }
                          ).selected,
                        ),
                      )}
                  ></md-switch>
                </div>
              {/each}
              {#if !appDetails.permissions.length}
                <p>{m.apps_permissions_empty()}</p>
              {/if}
            </div>
          </section>
        {/if}
      {/if}
    </aside>
  </div>

  {#await import("../components/dialogs/DestructiveActionDialog.svelte") then { default: DestructiveActionDialog }}
    <DestructiveActionDialog
      action={destructiveAction}
      appName={appDetails?.display_name || selectedPackage}
      packageName={selectedPackage}
      iconDataUrl={appDetails?.icon_data_url || ""}
      busy={destructiveBusy}
      onClose={() => (destructiveAction = null)}
      onConfirm={performDestructiveAppAction}
    />
  {/await}

  {#await import("../components/dialogs/InstallationDialog.svelte") then { default: InstallationDialog }}
    <InstallationDialog
      open={installOpen}
      files={installFiles}
      options={{
        replace: installReplace,
        grant: installGrant,
        test: installTest,
        bypass: installBypass,
      }}
      canInstall={Boolean(serial && installFiles.length)}
      onClose={() => (installOpen = false)}
      onChooseFiles={chooseInstallFiles}
      onRemoveFile={(file) => {
        installFiles = installFiles.filter((value) => value !== file);
      }}
      onOptionChange={(option, value) => {
        if (option === "replace") installReplace = value;
        else if (option === "grant") installGrant = value;
        else if (option === "test") installTest = value;
        else if (option === "bypass") installBypass = value;
      }}
      onInstall={installSelectedApps}
      {javaAvailable}
    />
  {/await}
</div>

<style>
  :global {
    .apps-material-host {
      height: 100%;
      min-height: 0;
      container-type: inline-size;
    }
    .apps-material-page {
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(470px, 1.25fr) minmax(430px, 1fr);
      gap: 16px;
    }
    .apps-material-catalog,
    .apps-material-detail {
      min-height: 0;
      overflow: hidden;
      background: var(--surface-container-low);
      border: 1px solid var(--outline-variant);
      border-radius: 24px;
    }
    .apps-material-catalog {
      display: flex;
      flex-direction: column;
    }
    .apps-material-toolbar {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) auto auto auto;
      align-items: center;
      gap: 8px;
      padding: 14px;
      border-bottom: 1px solid var(--outline-variant);
    }
    .apps-material-search {
      width: 100%;
      --md-outlined-field-container-shape: 999px;
      --md-outlined-field-top-space: 8px;
      --md-outlined-field-bottom-space: 8px;
      --md-outlined-field-content-size: 12px;
      --md-outlined-field-label-text-size: 12px;
    }
    .apps-material-toolbar md-filled-tonal-button {
      --md-filled-tonal-button-container-shape: 999px;
      white-space: nowrap;
    }
    .apps-material-toolbar md-icon-button {
      --md-icon-button-icon-color: var(--on-surface-variant);
    }
    .apps-material-host .app-icon-frame {
      display: grid;
      place-items: center;
      flex: 0 0 62px;
      width: 62px;
      height: 62px;
      aspect-ratio: 1;
    }
    .apps-material-host .app-icon-frame > img,
    .apps-material-host .app-icon-frame > .app-fallback {
      display: grid;
      width: 100%;
      height: 100%;
      min-width: 100%;
      min-height: 100%;
      place-items: center;
      border-radius: 16px;
      object-fit: cover;
    }
    .apps-material-host .app-fallback {
      display: grid;
      place-items: center;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: 0.5px;
      background: var(--primary-container);
      color: var(--on-primary-container);
    }
    .apps-material-host .app-fallback.tone-1 {
      background: color-mix(
        in srgb,
        #9333ea 20%,
        var(--surface-container-highest)
      );
      color: color-mix(in srgb, #9333ea 80%, var(--on-surface));
    }
    .apps-material-host .app-fallback.tone-2 {
      background: color-mix(
        in srgb,
        #e11d48 20%,
        var(--surface-container-highest)
      );
      color: color-mix(in srgb, #e11d48 80%, var(--on-surface));
    }
    .apps-material-host .app-fallback.tone-3 {
      background: color-mix(
        in srgb,
        #059669 20%,
        var(--surface-container-highest)
      );
      color: color-mix(in srgb, #059669 80%, var(--on-surface));
    }
    .apps-material-host .app-fallback.tone-4 {
      background: color-mix(
        in srgb,
        #d97706 20%,
        var(--surface-container-highest)
      );
      color: color-mix(in srgb, #d97706 80%, var(--on-surface));
    }
    .apps-material-host .app-fallback.tone-5 {
      background: color-mix(
        in srgb,
        #0284c7 20%,
        var(--surface-container-highest)
      );
      color: color-mix(in srgb, #0284c7 80%, var(--on-surface));
    }
    .apps-material-filters {
      display: flex;
      gap: 5px;
      overflow: auto;
      padding: 10px 14px;
      border-bottom: 1px solid var(--outline-variant);
      scrollbar-width: none;
    }
    .apps-material-filters::-webkit-scrollbar {
      display: none;
    }
    .apps-material-filters button {
      position: relative;
      display: flex;
      height: 36px;
      align-items: center;
      gap: 6px;
      padding: 0 11px;
      overflow: hidden;
      color: var(--on-surface-variant);
      background: transparent;
      border: 0;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .apps-material-filters button:hover {
      background: var(--surface-container-high);
    }
    .apps-material-filters button.active {
      color: var(--on-primary-container);
      background: var(--primary-container);
    }
    .apps-material-filters :global(.material-symbols-rounded) {
      font-size: 17px;
    }
    .apps-material-filters strong {
      display: grid;
      min-width: 20px;
      height: 20px;
      place-items: center;
      padding: 0 5px;
      background: color-mix(in srgb, currentColor 10%, transparent);
      border-radius: 999px;
      font-size: 9px;
    }
    .debloat-grouped-view::-webkit-scrollbar {
      width: 14px;
    }
    .debloat-grouped-view::-webkit-scrollbar-thumb {
      background-color: var(--outline-variant);
      border: 4px solid var(--surface-container-low);
      border-radius: 99px;
    }
    .apps-material-grid {
      display: grid;
      flex: 1;
      grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
      grid-auto-rows: 190px;
      align-content: start;
      gap: 10px;
      overflow: auto;
      padding: 12px;
    }
    .apps-material-tile {
      position: relative;
      display: flex;
      min-width: 0;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 16px 11px 11px;
      overflow: hidden;
      color: var(--on-surface);
      background: var(--surface-container);
      border: 1px solid transparent;
      border-radius: 20px;
      text-align: center;
      transition:
        background-color var(--transition-fast),
        border-color var(--transition-fast);
      content-visibility: auto;
      contain-intrinsic-size: 155px 190px;
    }
    .apps-material-tile:hover {
      background: var(--surface-container-high);
    }
    .apps-material-tile.selected {
      color: var(--on-primary-container);
      background: var(--primary-container);
      border-color: var(--primary);
    }
    .apps-material-tile .app-icon-frame {
      width: 68px;
      height: 68px;
      flex-basis: 68px;
    }
    .apps-material-tile .app-icon-frame > img,
    .apps-material-tile .app-fallback {
      border-radius: 18px;
    }
    .apps-material-tile__copy {
      display: block;
      width: 100%;
      min-width: 0;
    }
    .apps-material-tile__copy strong,
    .apps-material-tile__copy small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .apps-material-tile__copy strong {
      font-size: 14px;
    }
    .apps-material-tile__copy small {
      margin-top: 3px;
      color: var(--on-surface-variant);
      font-size: 11px;
    }
    .apps-material-status-icon {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      background: var(--surface-container-highest);
      color: var(--on-surface-variant);
      border-radius: 50%;
    }
    .apps-material-status-icon :global(.material-symbols-rounded) {
      font-size: 16px;
    }
    .apps-material-status-icon.disabled {
      color: var(--error);
      background: color-mix(in srgb, var(--error) 12%, transparent);
    }
    .apps-material-status-icon.uninstalled {
      color: var(--on-surface-variant);
      background: var(--surface-container-high);
      border: 1px dashed var(--outline-variant);
    }
    .apps-material-tile .apps-material-status-icon {
      position: absolute;
      top: 10px;
      right: 10px;
    }
    .apps-material-detail__hero .apps-material-status-icon {
      margin-top: 6px;
    }
    .apps-material-section-loader {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 40px 0;
    }
    .apps-material-section-loader md-circular-progress {
      --md-circular-progress-size: 40px;
    }
    .apps-material-detail {
      overflow: auto;
      padding: 18px;
    }
    .apps-material-back {
      display: none;
    }
    .apps-material-detail__hero {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 16px;
      padding: 4px 2px 20px;
      border-bottom: 1px solid var(--outline-variant);
    }
    .apps-material-detail__hero .app-icon-frame {
      width: 84px;
      height: 84px;
      flex-basis: 84px;
    }
    .apps-material-detail__hero .app-icon-frame > img,
    .apps-material-detail__hero .app-fallback {
      border-radius: 22px;
    }
    .apps-material-detail__hero h2 {
      overflow: hidden;
      margin: 0;
      font-size: 27px;
      font-weight: 650;
      line-height: 1.15;
      text-overflow: ellipsis;
    }
    .apps-material-detail__hero p {
      margin: 5px 0 9px;
      overflow-wrap: anywhere;
      color: var(--on-surface-variant);
      font-size: 13px;
    }
    .apps-material-section {
      padding: 18px 0;
      border-bottom: 1px solid var(--outline-variant);
    }
    .apps-material-section:last-child {
      border-bottom: 0;
    }
    .apps-material-section > header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .apps-material-section__title,
    .apps-material-section__meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .apps-material-section__title {
      min-width: 0;
      color: var(--on-surface);
    }
    .apps-material-section__title > :global(.material-symbols-rounded) {
      color: var(--primary);
      font-size: 20px;
    }
    .apps-material-section__title h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 650;
    }
    .apps-material-section__meta {
      margin-left: auto;
      color: var(--on-surface-variant);
      font-size: 12px;
      white-space: nowrap;
    }
    .apps-material-section > header > md-circular-progress,
    .apps-material-section__meta md-circular-progress {
      flex: 0 0 20px;
      width: 20px;
      height: 20px;
    }
    .apps-material-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }
    .apps-material-actions > * {
      width: 100%;
      --md-filled-button-container-shape: 14px;
      --md-filled-tonal-button-container-shape: 14px;
      --md-outlined-button-container-shape: 14px;
    }
    .apps-material-actions .apps-material-danger {
      --md-outlined-button-label-text-color: var(--error);
      --md-outlined-button-icon-color: var(--error);
      --md-outlined-button-outline-color: color-mix(
        in srgb,
        var(--error) 55%,
        transparent
      );
    }
    .apps-material-energy {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 7px;
    }
    .apps-material-energy button {
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 11px;
      overflow: hidden;
      color: var(--on-surface);
      background: var(--surface-container);
      border: 1px solid transparent;
      border-radius: 16px;
      text-align: left;
    }
    .apps-material-energy button:hover {
      background: var(--surface-container-high);
    }
    .apps-material-energy button.active {
      color: var(--on-primary-container);
      background: var(--primary-container);
      border-color: var(--primary);
    }
    .apps-material-energy :global(.material-symbols-rounded) {
      font-size: 20px;
    }
    .apps-material-energy strong,
    .apps-material-energy small {
      display: block;
    }
    .apps-material-energy strong {
      font-size: 14px;
    }
    .apps-material-energy small {
      margin-top: 2px;
      color: var(--on-surface-variant);
      font-size: 11px;
      line-height: 1.3;
    }
    .apps-material-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 7px;
      margin: 0;
    }
    .apps-material-info > div {
      display: flex;
      min-width: 0;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 10px;
      background: var(--surface-container);
      border-radius: 13px;
    }
    .apps-material-info > div.wide {
      grid-column: 1/-1;
    }
    .apps-material-info dt {
      color: var(--on-surface-variant);
      font-size: 12px;
      font-weight: 600;
    }
    .apps-material-info dd {
      min-width: 0;
      margin: 0;
      overflow-wrap: anywhere;
      text-align: right;
      font-size: 14px;
    }
    .apps-material-permissions {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .apps-material-permissions > div {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 9px 11px;
      background: var(--surface-container);
      border-radius: 14px;
    }
    .apps-material-permissions strong,
    .apps-material-permissions small {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .apps-material-permissions strong {
      font-size: 14px;
    }
    .apps-material-permissions small {
      margin-top: 2px;
      color: var(--on-surface-variant);
      font-size: 11px;
    }
    .apps-material-permissions p {
      color: var(--on-surface-variant);
      font-size: 13px;
      text-align: center;
    }
    .apps-material-empty {
      display: flex;
      grid-column: 1/-1;
      min-height: 220px;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 6px;
      color: var(--on-surface-variant);
      text-align: center;
    }
    .apps-material-empty.detail {
      height: 100%;
    }
    .apps-material-empty :global(.material-symbols-rounded) {
      margin-bottom: 4px;
      color: var(--primary);
      font-size: 42px;
    }
    .apps-material-empty strong {
      color: var(--on-surface);
      font-size: 15px;
    }
    .apps-material-empty span {
      font-size: 10px;
    }
    .apps-material-spin {
      animation: apps-material-spin 0.8s linear infinite;
    }
    @keyframes apps-material-spin {
      to {
        transform: rotate(360deg);
      }
    }
    @container (max-width:1050px) {
      .apps-material-page {
        display: block;
        position: relative;
      }
      .apps-material-catalog {
        height: 100%;
      }
      .apps-material-detail {
        display: none;
        height: 100%;
        border: 0;
      }
      .apps-material-page.detail-open .apps-material-catalog {
        display: none;
      }
      .apps-material-page.detail-open .apps-material-detail {
        display: block;
      }
      .apps-material-back {
        display: inline-flex;
        margin-bottom: 10px;
      }
      .apps-material-grid {
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      }
    }
    @container (max-width:700px) {
      .apps-material-toolbar {
        grid-template-columns: 1fr auto auto;
      }
      .apps-material-search {
        grid-column: 1/-1;
      }
      .apps-material-toolbar md-filled-tonal-button {
        min-width: 0;
      }
      .apps-material-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-auto-rows: 180px;
        padding: 8px;
      }
      .apps-material-actions,
      .apps-material-energy {
        grid-template-columns: 1fr 1fr;
      }
      .apps-material-info {
        grid-template-columns: 1fr;
      }
      .apps-material-info > div.wide {
        grid-column: auto;
      }
      .apps-material-detail {
        padding: 14px;
      }
      .apps-material-detail__hero h2 {
        font-size: 22px;
      }
    }
    @container (max-width:440px) {
      .apps-material-toolbar {
        grid-template-columns: 1fr auto;
      }
      .apps-material-toolbar md-filled-tonal-button {
        grid-column: 1/-1;
      }
      .apps-material-grid {
        grid-template-columns: 1fr;
      }
      .apps-material-actions,
      .apps-material-energy {
        grid-template-columns: 1fr;
      }
      .apps-material-detail__hero .app-icon-frame {
        width: 68px;
        height: 68px;
        flex-basis: 68px;
      }
    }
  }
</style>
