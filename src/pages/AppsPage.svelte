<script lang="ts" module>
import * as m from '../paraglide/messages';

  export interface AppSettings { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; }
</script>

<script lang="ts">

  import { invoke } from '@tauri-apps/api/core';
  import { open, save } from '@tauri-apps/plugin-dialog';
  
  import type { AppSummary, AppDetailsInfo, AppPermissionInfo } from './workbench/types';
  import DestructiveActionDialog from '../components/dialogs/DestructiveActionDialog.svelte';
  import InstallationDialog from '../components/dialogs/InstallationDialog.svelte';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import { appTone, formatBytes } from './workbench/utils';
  import './AppsPage.css';

  let {
    serial,
    setStatus,
    setBusy,
    run,
    scrcpy,
    tab,
    appSettings,
    javaAvailable
  } = $props<{
    serial: string;
    setStatus: (s: string) => void;
    setBusy: (b: boolean) => void;
    run: (args: string[], success?: string) => Promise<string | undefined>;
    scrcpy?: (args: string[]) => Promise<void>;
    tab: string;
    appSettings: AppSettings | null;
    javaAvailable: boolean;
  }>();

  let apps = $state.raw<AppSummary[]>([]);
  let appDetails = $state.raw<AppDetailsInfo | null>(null);
  let metadataLoading = $state(false);
  let attemptedMetadata = $state(false);
  let detailsLoading = $state(false);
  let installingApps = $state(false);
  let installOpen = $state(false);
  let installFiles = $state<string[]>([]);
  let installStatuses = $state<Record<string, 'idle' | 'installing' | 'success' | 'error'>>({});
  let installErrors = $state<Record<string, string>>({});

  let installReplace = $state(true);
  let installGrant = $state(true);
  let installTest = $state(true);
  let installBypass = $state(false);
  let filter = $state<'all' | 'user' | 'system' | 'disabled'>('user');
  let appFilter = $state('');
  let selectedPackage = $state('');
  let destructiveAction = $state<'uninstall' | 'clear-data' | null>(null);
  let destructiveBusy = $state(false);

  let filteredApps = $derived.by(() => {
    let result = apps;
    if (filter === 'user') result = result.filter(app => !app.system_app);
    if (filter === 'system') result = result.filter(app => app.system_app);
    if (appFilter) {
      const lower = appFilter.toLowerCase();
      result = result.filter(app => app.display_name.toLowerCase().includes(lower) || app.package_name.toLowerCase().includes(lower));
    }
    return result;
  });

  let appsNeedingMetadata = $derived(filteredApps.filter(app => !app.icon_data_url));

  let tabRef = $state(tab);
  $effect(() => { tabRef = tab; });

  let filterRef = $state(filter);
  $effect(() => { filterRef = filter; });

  async function refreshApps() {
    if (!serial) return;
    setBusy(true);
    attemptedMetadata = false;
    try {
      const value = await invoke<AppSummary[]>('list_apps', { serial });
      apps = value; 
      setStatus('');
    } catch (error) { 
      setStatus(String(error)); 
    } finally { 
      setBusy(false); 
    }
  }

  $effect(() => {
    if (tab === 'apps' && serial && !apps.length) refreshApps();
  });

  $effect(() => {
    if (tab === 'apps' && appSettings && !appSettings.cache_enabled && appsNeedingMetadata.length > 0 && !metadataLoading && !attemptedMetadata) {
      attemptedMetadata = true;
      loadVisibleMetadata();
    }
  });

  $effect(() => {
    // This effect runs when filter or tab changes
    filter; tab;
    attemptedMetadata = false;
  });

  async function refreshAppDetails(packageName = selectedPackage) {
    if (!serial || !packageName) return;
    detailsLoading = true;
    try {
      const value = await invoke<AppDetailsInfo>('get_app_details', { serial, packageName });
      const summary = apps.find(app => app.package_name === packageName);
      
      appDetails = appDetails?.package_name === packageName
        ? { 
            ...value, 
            display_name: summary && summary.display_name !== summary.package_name ? summary.display_name : value.display_name, 
            icon_data_url: summary?.icon_data_url || value.icon_data_url 
          }
        : appDetails;
        
      apps = apps.map(app => app.package_name === packageName ? {
        ...app,
        display_name: value.display_name !== value.package_name ? value.display_name : app.display_name,
        disabled: value.disabled,
        system_app: value.system_app,
        icon_data_url: value.icon_data_url || app.icon_data_url,
      } : app);
    } catch (error) { 
      setStatus(String(error)); 
    } finally { 
      detailsLoading = false; 
    }
  }

  async function selectApplication(app: AppSummary) {
    selectedPackage = app.package_name;
    appDetails = {
      ...app,
      is_split: false,
      version_name: '-',
      version_code: '-',
      target_sdk: '-',
      min_sdk: '-',
      installer: '-',
      data_dir: '-',
      code_size_bytes: -1,
      data_size_bytes: -1,
      cache_size_bytes: -1,
      background_mode: 'optimized',
      permissions: [],
      install_date: '-',
      update_date: '-',
    } as AppDetailsInfo;
    void refreshAppDetails(app.package_name);
  }

  async function loadVisibleMetadata() {
    if (!serial || !appsNeedingMetadata.length || metadataLoading) return;
    metadataLoading = true;
    if (tabRef === 'apps') {
      setStatus(m.workbench_status_metadataLoading({ count: appsNeedingMetadata.length }));
    }
    let loaded = 0;
    let failed = 0;
    const currentFilter = filterRef;
    try {
      for (let start = 0; start < appsNeedingMetadata.length; start += 3) {
        if (filterRef !== currentFilter || (!appSettings?.cache_enabled && tabRef !== 'apps')) {
          break;
        }
        const batch = appsNeedingMetadata.slice(start, start + 3);
        const results = await Promise.allSettled(batch.map(app => invoke<AppSummary>('enrich_app_summary', {
          serial, packageName: app.package_name, apkPath: app.apk_path, systemApp: app.system_app, disabled: app.disabled,
        })));
        const summaries = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
        loaded += summaries.length;
        failed += results.length - summaries.length;
        
        apps = apps.map(app => summaries.find(summary => summary.package_name === app.package_name) || app);
        
        if (appDetails) {
          const summary = summaries.find(item => item.package_name === appDetails!.package_name);
          if (summary) {
            appDetails = { ...appDetails, display_name: summary.display_name, icon_data_url: summary.icon_data_url };
          }
        }
        
        if (tabRef === 'apps') {
          setStatus(m.workbench_status_metadataProgress({ processed: Math.min(start + batch.length, appsNeedingMetadata.length), total: appsNeedingMetadata.length }));
        }
      }
      if (tabRef === 'apps') {
        setStatus(failed ? m.workbench_status_metadataFailed({ failed }) : '');
      }
    } finally { 
      metadataLoading = false; 
    }
  }

  async function chooseInstallFiles() {
    try {
      const selected = await open({
        title: m.apps_action_install(),
        multiple: true,
        directory: false,
        filters: [{ name: 'Android Packages', extensions: ['apk', 'apks', 'apkm', 'xapk', 'zip', 'aab'] }],
      });
      const selectedFiles = Array.isArray(selected) ? selected : selected ? [selected] : [];
      if (selectedFiles.length) {
        const newFiles = [...new Set([...installFiles, ...selectedFiles])];
        installFiles = newFiles;
        
        const nextStatuses = { ...installStatuses };
        newFiles.forEach(f => { if (!nextStatuses[f]) nextStatuses[f] = 'idle'; });
        installStatuses = nextStatuses;
      }
    } catch (error) { console.error(error); }
  }

  async function installSelectedApps() {
    if (!serial || !installFiles.length || installingApps) return;
    installingApps = true;
    installErrors = {};

    await Promise.all(installFiles.map(async (file) => {
      installStatuses = { ...installStatuses, [file]: 'installing' };
      try {
        const result = await invoke<string>('install_application_packages', {
          serial,
          files: [file],
          options: {
            replace_existing: installReplace,
            grant_runtime_permissions: installGrant,
            allow_test_packages: installTest,
            bypass_low_target_sdk_block: installBypass,
          },
        });
        
        if (result.includes('ERROR ·') || (!result.includes('Success') && !result.includes('OK ·'))) {
          const cleanResult = result
            .split('\n')
            .filter(line => !line.includes('Performing Streamed Install') && !line.toLowerCase().includes('preparing') && !line.startsWith('ERROR ·'))
            .join('\n')
            .trim();
          installErrors = { ...installErrors, [file]: cleanResult || result };
          installStatuses = { ...installStatuses, [file]: 'error' };
        } else {
          installStatuses = { ...installStatuses, [file]: 'success' };
        }
      } catch (error) {
        installErrors = { ...installErrors, [file]: String(error) };
        installStatuses = { ...installStatuses, [file]: 'error' };
      }
    }));
    
    installingApps = false;
    await refreshApps();
  }

  async function toggleAppEnabled() {
    if (!appDetails) return;
    const willDisable = !appDetails.disabled;
    const command = willDisable
      ? ['shell', 'pm', 'disable-user', '--user', '0', selectedPackage]
      : ['shell', 'pm', 'enable', '--user', '0', selectedPackage];
    const result = await run(command, willDisable ? m.workbench_status_appDisabled() : m.workbench_status_appEnabled());
    if (result === undefined) return;
    
    appDetails = { ...appDetails, disabled: willDisable };
    apps = apps.map(app => app.package_name === selectedPackage ? { ...app, disabled: willDisable } : app);
  }

  async function setBackgroundMode(mode: 'unrestricted' | 'optimized' | 'restricted') {
    if (!selectedPackage) return;
    const values = mode === 'unrestricted' ? ['allow', 'allow'] : mode === 'restricted' ? ['ignore', 'ignore'] : ['default', 'default'];
    await run(['shell', 'cmd', 'appops', 'set', selectedPackage, 'RUN_ANY_IN_BACKGROUND', values[0]]);
    await run(['shell', 'cmd', 'appops', 'set', selectedPackage, 'RUN_IN_BACKGROUND', values[1]]);
    await refreshAppDetails();
  }

  async function togglePermission(permission: AppPermissionInfo) {
    if (!selectedPackage) return;
    await run(['shell', 'pm', permission.granted ? 'revoke' : 'grant', selectedPackage, permission.name]);
    await refreshAppDetails();
  }

  async function exportApk() {
    if (!appDetails) return;
    try {
      const isSplit = appDetails.is_split;
      const extension = isSplit ? 'apks' : 'apk';
      const destination = await save({
        title: m.apps_action_saveApk(),
        defaultPath: `${appDetails.package_name}.${extension}`,
        filters: [{ name: 'Android Package', extensions: [extension] }],
      });
      if (destination) {
        setStatus(m.workbench_status_exporting({ path: destination }));
        await invoke('export_apk', { serial, packageName: appDetails.package_name, destination });
        setStatus(m.workbench_status_apkSaved({ path: destination }));
      }
    } catch (error) { setStatus(String(error)); }
  }

  async function clearApplicationCache() {
    if (!selectedPackage) return;
    await run(['shell', 'run-as', selectedPackage, 'sh', '-c', 'rm -rf cache/* code_cache/* 2>/dev/null || true']); 
    await refreshAppDetails();
  }

  async function performDestructiveAppAction() {
    if (!destructiveAction || !selectedPackage) return;
    destructiveBusy = true;
    try {
      if (destructiveAction === 'uninstall') {
        await run(['uninstall', selectedPackage], m.workbench_status_appUninstalled());
        selectedPackage = '';
        appDetails = null;
        await refreshApps();
      } else {
        await run(['shell', 'pm', 'clear', selectedPackage], m.workbench_status_appDataCleared());
        await refreshAppDetails();
      }
      destructiveAction = null;
    } finally {
      destructiveBusy = false;
    }
  }

  async function openAppInScrcpy(pkg: string) {
    setStatus(m.workbench_status_launchingApp({ pkg }));
    try {
      await invoke<string>('run_device_action', { serial, args: ['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'] });
      if (scrcpy) await scrcpy([]);
    } catch (e) {
      setStatus(String(e));
    }
  }

  let filters = $derived<Array<['user' | 'all' | 'system' | 'disabled', string, string]>>([
    ['user', m.apps_filter_user(), 'person'], 
    ['all', m.apps_filter_all(), 'apps'], 
    ['system', m.apps_filter_system(), 'settings'], 
    ['disabled', m.apps_filter_disabled(), 'block'],
  ]);
  
  let pending = $derived(filteredApps.filter(app => !app.icon_data_url || app.display_name === app.package_name).length);
  const count = (value: string) => apps.filter(app => value === 'all' ? true : value === 'disabled' ? app.disabled : value === 'system' ? app.system_app && !app.disabled : !app.system_app && !app.disabled).length;
</script>

<div class="apps-material-host">
  <div class="apps-material-page {selectedPackage ? 'detail-open' : ''}">
    <section class="apps-material-catalog">
      <header class="apps-material-toolbar">
        <md-outlined-text-field class="apps-material-search" label={m.apps_search_placeholder()} value={appFilter} oninput={(event: Event) => appFilter = (event.target as HTMLInputElement).value}>
          <MaterialIcon slot="leading-icon" name="search" />
          {#if appFilter}
            <md-icon-button slot="trailing-icon" onclick={() => appFilter = ''}>
              <MaterialIcon name="close" />
            </md-icon-button>
          {/if}
        </md-outlined-text-field>
        
        {#if appSettings?.cache_enabled && pending > 0}
          <md-filled-tonal-button disabled={metadataLoading ? true : undefined} onclick={loadVisibleMetadata}>
            <MaterialIcon slot="icon" name="image_search" />
            {metadataLoading ? m.common_loading() : m.apps_action_loadMetadata({ pending })}
          </md-filled-tonal-button>
        {/if}
        
        <md-icon-button aria-label={m.apps_action_refresh()} title={m.apps_action_refresh()} onclick={refreshApps}>
          <MaterialIcon name="refresh" />
        </md-icon-button>
        <md-filled-icon-button aria-label={m.apps_action_install()} title={m.apps_action_install()} onclick={() => installOpen = true}>
          <MaterialIcon name="add" />
        </md-filled-icon-button>
      </header>
      
      <nav class="apps-material-filters">
        {#each filters as [value, label, icon] (value)}
          <button class={filter === value ? 'active' : ''} onclick={() => filter = value}>
            <MaterialIcon name={icon} filled={filter === value} />
            <span>{label}</span>
            <strong>{count(value)}</strong>
            <md-ripple></md-ripple>
          </button>
        {/each}
      </nav>
      
      <div class="apps-material-grid">
        {#each filteredApps as app (app.package_name)}
          <button class="apps-material-tile {selectedPackage === app.package_name ? 'selected' : ''}" onclick={() => selectApplication(app)} ondblclick={() => openAppInScrcpy(app.package_name)}>
            <div class="apps-material-status-icon {app.disabled ? 'disabled' : ''}" title={app.disabled ? m.apps_status_disabled() : app.system_app ? m.apps_status_system() : m.apps_status_user()}>
              <MaterialIcon name={app.disabled ? 'block' : app.system_app ? 'settings' : 'person'} />
            </div>     
            <span class="app-icon-frame">
              {#if app.icon_data_url}
                <img src={app.icon_data_url} alt="" />
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
        {/each}
        {#if !filteredApps.length}
          <div class="apps-material-empty">
            <MaterialIcon name="search_off" />
            <strong>{m.apps_empty_title()}</strong>
            <span>{m.apps_empty_subtitle()}</span>
          </div>
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
        <md-text-button class="apps-material-back" onclick={() => { selectedPackage = ''; appDetails = null; }}>
          <MaterialIcon slot="icon" name="arrow_back" />
          {m.nav_apps()}
        </md-text-button>
        
        <header class="apps-material-detail__hero" style="position: relative">
          <span class="app-icon-frame">
            {#if appDetails.icon_data_url}
              <img src={appDetails.icon_data_url} alt="" />
            {:else}
              <span class="app-fallback {appTone(appDetails.package_name)}">{appDetails.display_name.slice(0, 2).toUpperCase()}</span>
            {/if}
          </span>
          <div style="flex: 1; min-width: 0; padding-right: 130px">
            <h2>{appDetails.display_name}</h2>
            <p>{appDetails.package_name}</p>
            <div class="apps-material-status-icon {appDetails.disabled ? 'disabled' : ''}" title={appDetails.disabled ? m.apps_status_disabled() : appDetails.system_app ? m.apps_detail_type_system() : m.apps_detail_type_user()}>
              <MaterialIcon name={appDetails.disabled ? 'block' : appDetails.system_app ? 'settings' : 'person'} />
            </div>
          </div>
          <md-text-button onclick={() => openAppInScrcpy(appDetails!.package_name)} style="position: absolute; top: 0; right: 0">
            <MaterialIcon slot="icon" name="desktop_windows" />
            {m.apps_action_openScrcpy()}
          </md-text-button>
        </header>
        
        <section class="apps-material-section">
          <header>
            <span class="apps-material-section__title">
              <MaterialIcon name="bolt" />
              <h3>{m.apps_detail_actions()}</h3>
            </span>
          </header>
          <div class="apps-material-actions">
            <md-filled-button onclick={() => run(['shell', 'monkey', '-p', selectedPackage, '1'])}>
              <MaterialIcon slot="icon" name="open_in_new" />
              {m.apps_action_open()}
            </md-filled-button>
            <md-filled-tonal-button onclick={() => run(['shell', 'am', 'force-stop', selectedPackage])}>
              <MaterialIcon slot="icon" name="stop_circle" />
              {m.apps_action_stop()}
            </md-filled-tonal-button>
            <md-filled-tonal-button onclick={toggleAppEnabled}>
              <MaterialIcon slot="icon" name={appDetails.disabled ? 'check_circle' : 'block'} />
              {appDetails.disabled ? m.apps_action_enable() : m.apps_action_disable()}
            </md-filled-tonal-button>
            <md-filled-tonal-button onclick={clearApplicationCache}>
              <MaterialIcon slot="icon" name="cleaning_services" />
              {m.common_clearCache()}
            </md-filled-tonal-button>
            <md-outlined-button onclick={() => destructiveAction = 'clear-data'}>
              <MaterialIcon slot="icon" name="delete_sweep" />
              {m.common_clearData()}
            </md-outlined-button>
            <md-outlined-button class="apps-material-danger" onclick={() => destructiveAction = 'uninstall'}>
              <MaterialIcon slot="icon" name="delete_forever" />
              {m.apps_action_uninstall()}
            </md-outlined-button>
            <md-filled-tonal-button onclick={exportApk}>
              <MaterialIcon slot="icon" name="download" />
              {m.apps_action_saveApk()}
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
              {#each [
                ['unrestricted', m.apps_energy_unrestricted(), 'speed'],
                ['optimized', m.apps_energy_optimized(), 'eco'],
                ['restricted', m.apps_energy_restricted(), 'battery_saver']
              ] as [value, label, icon]}
                <button class={appDetails.background_mode === value ? 'active' : ''} onclick={() => setBackgroundMode(value as 'unrestricted'|'optimized'|'restricted')}>
                  <MaterialIcon name={String(icon)} />
                  <span>
                    <strong>{label}</strong>
                    <small>
                      {value === 'unrestricted' ? m.apps_energy_unrestricted_desc() : 
                       value === 'optimized' ? m.apps_energy_optimized_desc() : 
                       m.apps_energy_restricted_desc()}
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
              <div><dt>{m.apps_info_version()}</dt><dd>{appDetails.version_name} ({appDetails.version_code})</dd></div>
              <div><dt>{m.apps_info_installDate()}</dt><dd>{appDetails.install_date}</dd></div>
              <div><dt>{m.apps_info_updateDate()}</dt><dd>{appDetails.update_date}</dd></div>
              <div><dt>{m.apps_info_targetSdk()}</dt><dd>{appDetails.target_sdk}</dd></div>
              <div><dt>{m.apps_info_minSdk()}</dt><dd>{appDetails.min_sdk}</dd></div>
              <div><dt>{m.apps_info_installer()}</dt><dd>{appDetails.installer}</dd></div>
              <div><dt>{m.apps_info_apkSize()}</dt><dd>{formatBytes(appDetails.code_size_bytes)}</dd></div>
              <div><dt>{m.apps_info_dataSize()}</dt><dd>{formatBytes(appDetails.data_size_bytes)}</dd></div>
              <div><dt>{m.apps_info_cacheSize()}</dt><dd>{formatBytes(appDetails.cache_size_bytes)}</dd></div>
              <div class="wide"><dt>{m.apps_info_apkPath()}</dt><dd>{appDetails.apk_path}</dd></div>
            </dl>
          </section>

          <section class="apps-material-section">
            <header>
              <span class="apps-material-section__title">
                <MaterialIcon name="shield" />
                <h3>{m.apps_detail_permissions()}</h3>
              </span>
              <span class="apps-material-section__meta">
                <span>{m.apps_permissions_count({ granted: appDetails.permissions.filter((p: AppPermissionInfo)=>p.granted).length, total: appDetails.permissions.length })}</span>
              </span>
            </header>
            <div class="apps-material-permissions">
              {#each appDetails.permissions as permission (permission.name)}
                <div>
                  <span>
                    <strong>{permission.name.split('.').pop()}</strong>
                    <small>{permission.name}</small>
                  </span>
                  <!-- svelte-ignore a11y_missing_attribute -->
                  <md-switch 
                    selected={permission.granted ? true : undefined} 
                    disabled={!permission.runtime ? true : undefined} 
                    onclick={() => togglePermission(permission)}
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
  
  <DestructiveActionDialog 
    action={destructiveAction} 
    appName={appDetails?.display_name || selectedPackage} 
    packageName={selectedPackage} 
    iconDataUrl={appDetails?.icon_data_url || ''} 
    busy={destructiveBusy} 
    onClose={() => destructiveAction = null} 
    onConfirm={performDestructiveAppAction} 
  />
  
  <InstallationDialog 
    open={installOpen} 
    files={installFiles} 
    installing={installingApps} 
    installStatuses={installStatuses} 
    installErrors={installErrors} 
    options={{ replace: installReplace, grant: installGrant, test: installTest, bypass: installBypass }} 
    canInstall={Boolean(serial && installFiles.length)} 
    onClose={() => installOpen = false} 
    onChooseFiles={chooseInstallFiles} 
    onRemoveFile={file => { 
      installFiles = installFiles.filter(value => value !== file); 
      const nextStatuses = {...installStatuses}; 
      delete nextStatuses[file]; 
      installStatuses = nextStatuses; 
      const nextErrors = {...installErrors}; 
      delete nextErrors[file]; 
      installErrors = nextErrors; 
    }} 
    onOptionChange={(option, value) => {
      if (option === 'replace') installReplace = value;
      else if (option === 'grant') installGrant = value;
      else if (option === 'test') installTest = value;
      else if (option === 'bypass') installBypass = value;
    }} 
    onInstall={installSelectedApps} 
    javaAvailable={javaAvailable} 
  />
</div>
