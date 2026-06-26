<script lang="ts" module>
import * as m from '../paraglide/messages';

  export type ConfigurableTool = 'adb' | 'scrcpy' | 'java';
  export type InstallableTool = 'adb' | 'scrcpy';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { getVersion, getName } from '@tauri-apps/api/app';
  import { invoke } from '@tauri-apps/api/core';
  import { open } from '@tauri-apps/plugin-dialog';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import type { ToolStatus, ToolsStatus } from './workbench/types';
  import { updateState } from '../context/update.svelte';
  
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import AppModal from '../components/dialogs/AppModal.svelte';
  import Logo from '../components/Logo.svelte';
  import { languages, getLanguageName } from '../context/i18n.svelte';
  import type { WindowEffectInfo, WindowEffectMode } from '../context/windowEffects';
  import { APACHE_LICENSE_2_0, MIT_LICENSE, ANDROID_LOGO_LICENSE } from '../utils/licenseTexts';
  import { materialTextFieldValue } from '../actions/materialTextFieldValue';
  let {
    theme,
    language,
    tools,
    checkingUpdates,
    adbPath = $bindable(),
    scrcpyPath = $bindable(),
    javaPath = $bindable(),
    onThemeChange,
    onLanguageChange,
    onSaveToolPath,
    onInstallTool,
    onClearCache,
    appSettings,
    onSaveAppSettings,
    defaultCacheDir
  } = $props<{
    theme: 'light' | 'dark' | 'auto';
    language: string;
    tools: ToolsStatus | null;
    checkingUpdates: boolean;
    adbPath: string;
    scrcpyPath: string;
    javaPath: string;
    onThemeChange: (theme: 'light' | 'dark' | 'auto') => void;
    onLanguageChange: (language: string) => void;
    onSaveToolPath: (tool: ConfigurableTool, path: string) => void;
    onInstallTool: (tool: InstallableTool) => void;
    onClearCache: () => void;
    appSettings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; material_you_enabled: boolean; material_you_background_tint: boolean; window_effect: WindowEffectMode; theme: string; language: string; packaged?: boolean; store_build?: boolean } | null;
    onSaveAppSettings: (settings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; material_you_enabled: boolean; material_you_background_tint: boolean; window_effect: WindowEffectMode; theme: string; language: string; packaged?: boolean; store_build?: boolean }) => void;
    defaultCacheDir: string;
  }>();

  let appVersion = $state('...');
  let appName = $state('ADB App');
  let localCachePath = $state<string | null>(null);
  let licensesOpen = $state(false);
  let windowEffectInfo = $state<WindowEffectInfo>({ platform: 'linux', windows_11: false });

  type LicenseInfo = { name: string; url: string; licenseType: string; licenseText: string };
  const LICENSES: LicenseInfo[] = [
    { name: 'ADB', url: 'https://android.googlesource.com/platform/packages/modules/adb/', licenseType: 'Apache License 2.0', licenseText: APACHE_LICENSE_2_0 },
    { name: 'scrcpy', url: 'https://github.com/Genymobile/scrcpy', licenseType: 'Apache License 2.0', licenseText: APACHE_LICENSE_2_0 },
    { name: 'Bundletool', url: 'https://github.com/google/bundletool', licenseType: 'Apache License 2.0', licenseText: APACHE_LICENSE_2_0 },
    { name: 'Material Web', url: 'https://github.com/material-components/material-web', licenseType: 'Apache License 2.0', licenseText: APACHE_LICENSE_2_0 },
    { name: 'Tauri', url: 'https://github.com/tauri-apps/tauri', licenseType: 'MIT / Apache 2.0', licenseText: MIT_LICENSE + '\n\n---\n\n' + APACHE_LICENSE_2_0 },
    { name: 'Svelte', url: 'https://github.com/sveltejs/svelte', licenseType: 'MIT License', licenseText: MIT_LICENSE },
    { name: 'Android Logo', url: 'https://creativecommons.org/licenses/by/3.0/', licenseType: 'CC BY 3.0', licenseText: ANDROID_LOGO_LICENSE }
  ];



  onMount(() => {
    getVersion().then(v => appVersion = v).catch(() => appVersion = 'Unknown');
    getName().then(n => appName = n).catch(() => {});
    invoke<WindowEffectInfo>('get_window_effect_info')
      .then(value => windowEffectInfo = value)
      .catch(() => {});
  });

  $effect(() => {
    if (appSettings && localCachePath === null) {
      localCachePath = appSettings.cache_path;
    }
  });

  function getToolStateLabel(tool: ToolStatus, checking: boolean) {
    if (!tool.available) return m.settings_notInstalled();
    if (tool.update_available) return m.settings_updateAvailable();
    if (checking) return m.settings_checkingUpdate();
    if (tool.update_checked) return m.settings_updated();
    return m.settings_checkFailed();
  }

  function getToolIconName(tool: ToolStatus, checking: boolean) {
    if (!tool.available) return 'close';
    if (tool.update_available) return 'new_releases';
    if (checking) return 'sync';
    if (tool.update_checked) return 'check_circle';
    return 'help';
  }

  async function pickDirectory(onChange: (p: string) => void) {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
      onChange(selected);
    }
  }

  function updaterStatusLabel() {
    if (updateState.status === 'downloading') {
      return updateState.totalBytes ? `${m.updater_status_downloading()} (${updateState.progress}%)` : m.updater_status_downloading();
    }
    if (updateState.status === 'installing') return m.updater_status_installing();
    if (updateState.status === 'restarting') return m.updater_status_restarting();
    return '';
  }

  function saveWindowEffect(windowEffect: WindowEffectMode) {
    if (appSettings) {
      onSaveAppSettings({ ...appSettings, window_effect: windowEffect });
    }
  }
</script>

<div class="settings-grid">
  
  {#if updateState.hasUpdate}
    <section class="settings-card" style="grid-column: 1 / -1; border-color: var(--md-sys-color-primary); background: color-mix(in srgb, var(--md-sys-color-primary) 5%, var(--surface-container-low));">
      <h3 class="settings-title" style="color: var(--md-sys-color-primary); display: flex; align-items: center; gap: 8px;">
        <MaterialIcon name="system_update" />
        {m.updater_newUpdateAvailable()}
      </h3>
      <div style="display: flex; gap: 8px; flex-direction: column; margin-bottom: 16px;">
        <span style="font-size: 14px; color: var(--md-sys-color-on-surface-variant)">{m.updater_currentVersion()}: {updateState.currentVersion}</span>
        <span style="font-size: 14px; color: var(--md-sys-color-on-surface-variant)">{m.updater_newVersion()}: <strong style="color: var(--md-sys-color-primary)">{updateState.updateInfo!.version}</strong></span>
      </div>
      {#if updaterStatusLabel()}
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 16px; color: var(--md-sys-color-primary);">
          <md-circular-progress indeterminate></md-circular-progress>
          <span>{updaterStatusLabel()}</span>
        </div>
      {/if}
      {#if updateState.error}
        <p style="margin: 0 0 16px; color: var(--md-sys-color-error); line-height: 1.5; white-space: pre-wrap;">
          {m.updater_error({ error: updateState.error })}
        </p>
      {/if}
      <div class="button-row" style="justify-content: flex-end;">
        <md-outlined-button disabled={updateState.busy ? true : undefined} onclick={() => openUrl('https://github.com/kyro206/ADB-App/blob/main/CHANGELOG.md')}>
          {m.updater_changelog()}
        </md-outlined-button>
        <md-filled-button disabled={updateState.busy ? true : undefined} onclick={async () => await updateState.install()}>
          {updateState.busy ? m.updater_status_downloading() : m.updater_updateNow()}
        </md-filled-button>
      </div>
    </section>
  {/if}
  
  <section class="settings-card">
    <h3 class="settings-title">{m.settings_generalTitle()}</h3>
    <div class="form-stack">          
      <md-outlined-select 
        label={m.settings_language()}
        value={language} 
        onchange={(e: any) => onLanguageChange(e.target.value)}
        style="width: 100%"
      >
        {#each languages as lang}
          <md-select-option value={lang}>
            <div slot="headline">{getLanguageName(lang)}</div>
          </md-select-option>
        {/each}
      </md-outlined-select>

      <label class="settings-switch-row" style="width: 100%; box-sizing: border-box;">
        <span class="md3-body-large">{m.settings_killAdbOnExit()}</span>
        <md-switch 
          selected={appSettings?.kill_adb_on_exit ?? true}
          onchange={(e: any) => {
            if (appSettings) {
              onSaveAppSettings({ ...appSettings, kill_adb_on_exit: e.target.selected });
            }
          }}
        ></md-switch>
      </label>
    </div>
  </section>

  <section class="settings-card">
    <h3 class="settings-title">{m.settings_appearance()}</h3>
    <div class="settings-appearance-row">
      <div class="md3-segmented-button">
        <button class={theme === 'light' ? 'active' : ''} onclick={() => onThemeChange('light')}>
          <MaterialIcon name="light_mode" />
          <span>{m.settings_theme_light()}</span>
        </button>
        <button class={theme === 'dark' ? 'active' : ''} onclick={() => onThemeChange('dark')}>
          <MaterialIcon name="dark_mode" />
          <span>{m.settings_theme_dark()}</span>
        </button>
        <button class={theme === 'auto' ? 'active' : ''} onclick={() => onThemeChange('auto')}>
          <MaterialIcon name="brightness_auto" />
          <span>{m.settings_theme_auto()}</span>
        </button>
      </div>

      {#if appSettings && (windowEffectInfo.platform === 'windows' || windowEffectInfo.platform === 'macos')}
        {#if windowEffectInfo.platform === 'windows' && windowEffectInfo.windows_11}
          <md-outlined-select
            label={m.settings_windowEffects()}
            value={appSettings.window_effect || 'system'}
            onchange={(e: any) => saveWindowEffect(e.target.value)}
            style="width: 100%"
          >
            <md-select-option value="system">
              <div slot="headline">{m.settings_windowEffect_mica()}</div>
            </md-select-option>
            <md-select-option value="acrylic">
              <div slot="headline">{m.settings_windowEffect_acrylic()}</div>
            </md-select-option>
            <md-select-option value="disabled">
              <div slot="headline">{m.settings_windowEffect_disabled()}</div>
            </md-select-option>
          </md-outlined-select>
        {:else}
          <label class="settings-switch-row" style="width: 100%; box-sizing: border-box;">
            <span class="md3-body-large">{m.settings_windowEffects()}</span>
            <md-switch
              selected={(appSettings.window_effect || 'system') !== 'disabled'}
              onchange={(e: any) => saveWindowEffect(e.target.selected ? 'system' : 'disabled')}
            ></md-switch>
          </label>
        {/if}
      {/if}

      <label class="settings-switch-row" style="width: 100%; box-sizing: border-box;">
        <span class="md3-body-large">{m.settings_materialYouWallpaper()}</span>
        <md-switch 
          selected={appSettings?.material_you_enabled ?? true}
          onchange={(e: any) => {
            if (appSettings) {
              onSaveAppSettings({ ...appSettings, material_you_enabled: e.target.selected });
            }
          }}
        ></md-switch>
      </label>
      <label class="settings-switch-row" style="width: 100%; box-sizing: border-box;">
        <span class="md3-body-large">{m.settings_materialYouTint()}</span>
        <md-switch
          selected={appSettings?.material_you_background_tint ?? true}
          disabled={appSettings ? !appSettings.material_you_enabled : false}
          onchange={(e: any) => {
            if (appSettings) {
              onSaveAppSettings({ ...appSettings, material_you_background_tint: e.target.selected });
            }
          }}
        ></md-switch>
      </label>
    </div>
  </section>
  
  {#snippet toolPanel(title: string, toolName: InstallableTool, tool: ToolStatus | undefined, path: string, placeholder: string, onChange: (p: string) => void)}
    <section class="settings-card">
      <h3 class="settings-title">{title}</h3>
      {#if tool}
        <div class="tool-status">
          <div class="tool-status-header">
            <MaterialIcon 
              name={getToolIconName(tool, checkingUpdates)} 
              size={20} 
              style={!tool.available ? 'color: var(--md-sys-color-error)' : ''}
            />
            <strong style={!tool.available ? 'color: var(--md-sys-color-error)' : ''}>
              {getToolStateLabel(tool, checkingUpdates)}
            </strong>
          </div>
          <div class="tool-status-details">
            <span>{m.settings_source()}: {tool.source || '-'}</span>
            <span>{m.settings_installedVersion()}: {tool.version || '-'}</span>
            {#if tool.latest_version}
              <span>{m.settings_latestVersion()}: {tool.latest_version}</span>
            {/if}
          </div>
        </div>
      {/if}
      <div class="form-stack">
        <md-outlined-text-field
          use:materialTextFieldValue={path}
          oninput={(e: any) => onChange(e.target.value)}
          label={placeholder}
          style="width: 100%"
        >
          <md-icon-button slot="trailing-icon" onclick={() => pickDirectory(onChange)}>
            <MaterialIcon name="folder_open" />
          </md-icon-button>
        </md-outlined-text-field>
        <div class="button-row">
          <md-filled-button onclick={() => onSaveToolPath(toolName, path)}>
            {m.settings_savePath()}
          </md-filled-button>
          {#if appSettings?.store_build && toolName === 'adb'}
            <md-outlined-button onclick={() => onSaveToolPath(toolName, '')}>
              <MaterialIcon name="restore" slot="icon" />
              {m.common_reset()}
            </md-outlined-button>
          {:else}
            <md-outlined-button onclick={() => onSaveToolPath(toolName, '')}>
              {m.settings_autoDetect()}
            </md-outlined-button>
          {/if}
          
          {#if tool?.install_supported && !tool.available && !appSettings?.store_build}
            <md-filled-button onclick={() => onInstallTool(toolName)}>
              <MaterialIcon name="download" slot="icon" />
              {m.settings_install()} {title.split(' ')[0]}
            </md-filled-button>
          {/if}
          {#if tool?.install_supported && tool.update_available && !appSettings?.store_build}
            <md-filled-button onclick={() => onInstallTool(toolName)}>
              <MaterialIcon name="update" slot="icon" />
              {m.settings_update()} {title.split(' ')[0]}
            </md-filled-button>
          {/if}
        </div>
      </div>
    </section>
  {/snippet}

  {@render toolPanel("ADB", "adb", tools?.adb, adbPath, m.settings_adbPlaceholder(), p => adbPath = p)}
  {#if !appSettings?.store_build}
    {@render toolPanel("scrcpy", "scrcpy", tools?.scrcpy, scrcpyPath, m.settings_scrcpyPlaceholder(), p => scrcpyPath = p)}
  {/if}
  
  {#if !appSettings?.store_build}
    <section class="settings-card">
      <h3 class="settings-title">{m.settings_javaTitle()}</h3>
      <div class="tool-status">
        <div class="tool-status-header">
          <MaterialIcon 
            name={tools?.java.available ? 'check_circle' : 'warning'} 
            size={20} 
          />
          <strong>{tools?.java.available ? m.settings_javaCompatible() : tools?.java.path ? m.settings_javaNotCompatible() : m.settings_javaNotDetected()}</strong>
        </div>
        <div class="tool-status-details">
          <span>{m.settings_installedVersion()}: {tools?.java.version || '-'}</span>
        </div>
      </div>
      <div class="form-stack">
        <md-outlined-text-field 
          use:materialTextFieldValue={javaPath}
          oninput={(e: any) => javaPath = e.target.value} 
          label={m.settings_javaPlaceholder()}
          style="width: 100%"
        >
          <md-icon-button slot="trailing-icon" onclick={() => pickDirectory((p) => javaPath = p)}>
            <MaterialIcon name="folder_open" />
          </md-icon-button>
        </md-outlined-text-field>
        <div class="button-row">
          <md-filled-button onclick={() => onSaveToolPath('java', javaPath)}>{m.settings_savePath()}</md-filled-button>
          <md-outlined-button onclick={() => onSaveToolPath('java', '')}>{m.settings_autoDetect()}</md-outlined-button>
          <md-text-button href="https://adoptium.net/es/temurin/releases" target="_blank" rel="noreferrer">
            <MaterialIcon name="open_in_new" slot="icon" />
            {m.settings_downloadTemurin()}
          </md-text-button>
        </div>
      </div>
    </section>
  {/if}
  
  <section class="settings-card">
    <h3 class="settings-title">{m.settings_cacheTitle()}</h3>
    {#snippet clearCacheButton()}
      <md-outlined-button onclick={onClearCache}>
        <MaterialIcon name="delete" slot="icon" />
        {m.common_clearCache()}
      </md-outlined-button>
    {/snippet}
    <div class="form-stack">          
      <label class="settings-switch-row">
        <span class="md3-body-large">{m.settings_enableCache()}</span>
        <md-switch 
          selected={appSettings?.cache_enabled ?? true}
          onchange={(e: any) => {
            if (appSettings) {
              onSaveAppSettings({ ...appSettings, cache_enabled: e.target.selected });
            }
          }}
        ></md-switch>
      </label>

      {#if appSettings?.packaged}
        <p style="font-size: 13px; color: var(--md-sys-color-on-surface-variant); display: flex; align-items: center; gap: 6px; margin: 8px 0 0">
          <MaterialIcon name="info" size={16} />
          {m.settings_storeManagedPath()}
        </p>
        <div class="button-row settings-cache-actions" style="margin-top: 16px">
          {@render clearCacheButton()}
        </div>
      {:else}
        <md-outlined-text-field
          use:materialTextFieldValue={localCachePath || appSettings?.cache_path || defaultCacheDir}
          oninput={(e: any) => localCachePath = e.target.value}
          label={m.settings_cachePathPlaceholder()}
          style="width: 100%"
        >
          <md-icon-button slot="trailing-icon" onclick={() => pickDirectory((p) => localCachePath = p)}>
            <MaterialIcon name="folder_open" />
          </md-icon-button>
        </md-outlined-text-field>

        <div class="button-row settings-cache-actions" style="margin-top: 16px">
          <md-filled-button onclick={() => {
            if (appSettings && localCachePath !== null) {
              onSaveAppSettings({ ...appSettings, cache_path: localCachePath });
            }
          }}>
            {m.settings_savePath()}
          </md-filled-button>

          <md-outlined-button onclick={() => {
            if (appSettings) {
              localCachePath = '';
              onSaveAppSettings({ ...appSettings, cache_path: '' });
            }
          }}>
            {m.common_reset()}
          </md-outlined-button>
          {@render clearCacheButton()}
        </div>
        <p style="font-size: 13px; color: var(--md-sys-color-error); display: flex; align-items: center; gap: 6px; margin: 8px 0 0">
          <MaterialIcon name="info" size={16} />
          {m.settings_cacheRestartWarning()}
        </p>
      {/if}
    </div>
  </section>



  <section class="settings-card" style="grid-column: 1 / -1">
    <h3 class="settings-title">{m.settings_aboutTitle()}</h3>
    <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 20px; text-align: left; padding: 16px 0">
      
      <div style="display: flex; width: 100%; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px">
        <div style="display: flex; align-items: center; gap: 16px">
          <Logo size={64} />
          <div style="display: flex; flex-direction: column; justify-content: center">
            <h2 style="margin: 0 0 2px 0; font-size: 24px; line-height: 1.2">{appName}</h2>
            <span style="color: var(--md-sys-color-on-surface-variant); font-size: 14px">{appVersion}</span>
          </div>
        </div>
        <div style="display: flex; gap: 8px">
          {#if appSettings?.store_build}
            <md-outlined-button onclick={() => invoke('open_store_review')}>
              <MaterialIcon name="star" slot="icon" />
              {m.settings_aboutReview()}
            </md-outlined-button>
          {/if}
          <md-filled-button href="https://github.com/kyro206/ADB-App" target="_blank" rel="noreferrer">
            <MaterialIcon name="code" slot="icon" />
            GitHub
          </md-filled-button>
          <md-outlined-button onclick={() => licensesOpen = true}>
            <MaterialIcon name="gavel" slot="icon" />
            {m.settings_aboutLicenses()}
          </md-outlined-button>
        </div>
      </div>

      <p style="font-size: 13px; color: var(--md-sys-color-error); display: flex; align-items: center; gap: 6px; margin: 0 0 8px 0">
        <MaterialIcon name="warning" size={16} />
        {m.settings_aboutDisclaimer()}
      </p>
      
      <div style="display: flex; align-items: center; gap: 12px; width: 100%">
        <img 
          src="https://github.com/kyro206.png?size=200" 
          alt="Kyro206" 
          draggable="false"
          style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: var(--md-sys-color-surface-variant); user-select: none; -webkit-user-drag: none;"
          onerror={(e) => {
            (e.currentTarget as HTMLElement).style.display = 'none';
          }}
        />
        <div style="display: flex; flex-direction: column">
          <span style="font-size: 12px; color: var(--md-sys-color-on-surface-variant)">
            {m.settings_aboutCreator()}
          </span>
          <div style="display: flex; align-items: center; gap: 6px">
            <strong style="font-size: 15px; color: var(--md-sys-color-on-surface)">Kyro206</strong>
            <md-icon-button onclick={() => openUrl('https://github.com/kyro206')} title="GitHub Profile" style="--md-icon-button-icon-size: 16px;">
              <MaterialIcon name="open_in_new" size={16} />
            </md-icon-button>
          </div>
        </div>
      </div>
      
    </div>
  </section>
  <AppModal open={licensesOpen} onClose={() => licensesOpen = false} title={m.settings_aboutLicenses()} width="large">
    <div style="display: flex; flex-direction: column; gap: 24px">
      <div style="background: var(--md-sys-color-surface-container); padding: 16px; border-radius: 12px; overflow-y: auto; border: 1px solid var(--md-sys-color-outline-variant)">
        {#each LICENSES as lic, index}
          <div style="margin-bottom: {index === LICENSES.length - 1 ? '0' : '32px'}">
            <div style="border-bottom: 1px dashed var(--md-sys-color-outline-variant); padding-bottom: 8px; margin-bottom: 12px">
              <h4 style="margin: 0 0 4px 0; font-size: 16px; color: var(--md-sys-color-on-surface); display: flex; align-items: center; justify-content: space-between">
                {lic.name}
                <md-icon-button onclick={() => openUrl(lic.url)} title="Código original" style="--md-icon-button-icon-size: 18px;">
                  <MaterialIcon name="open_in_new" size={18} />
                </md-icon-button>
              </h4>
              <span style="font-size: 12px; color: var(--md-sys-color-on-surface-variant)">{lic.licenseType}</span>
            </div>
            <div style="font-size: 12px; font-family: monospace; white-space: pre-wrap; color: var(--md-sys-color-on-surface-variant)">
              {lic.licenseText}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </AppModal>
</div>

<style>
:global {
/* --- GRID Y LAYOUT --- */
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 0;
  color: var(--md-sys-color-on-surface);
}

/* --- TARJETAS MD3 (CARDS) --- */
.settings-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  background-color: var(--surface-container-low, var(--md-sys-color-surface-container));
  color: var(--md-sys-color-on-surface);
  border: 1px solid var(--outline-variant, transparent);
  border-radius: 24px;
  padding: 20px;
  transition: background-color 0.3s ease;
}

.settings-title {
  margin: 0 0 16px 0;
  font-size: 22px;
  font-weight: 500;
  letter-spacing: 0px;
  color: var(--md-sys-color-on-surface);
}

/* --- ALINEACIÓN DE FORMULARIOS --- */
.form-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.button-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

/* --- FILA DE APARIENCIA --- */
.settings-appearance-row {
  display: flex;
  flex-direction: column;
  gap: 24px;
  align-items: flex-start;
}

.settings-appearance-row .md3-segmented-button {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-self: stretch;
  width: 100%;
  overflow: hidden;
  background: var(--surface-container, var(--md-sys-color-surface-container));
  border: 1px solid var(--outline-variant, var(--md-sys-color-outline));
  border-radius: 999px;
}

.settings-appearance-row .md3-segmented-button button {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 80px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 8px;
  color: var(--on-surface-variant, var(--md-sys-color-on-surface-variant));
  background: transparent;
  border: 0;
  border-right: 1px solid var(--outline-variant, var(--md-sys-color-outline));
  border-radius: 0;
  font-size: 14px;
  font-weight: 600;
}

.settings-appearance-row .md3-segmented-button :global(.material-symbols-rounded) {
  font-size: 22px;
}

.settings-appearance-row .md3-segmented-button button:last-child {
  border-right: 0;
}

.settings-appearance-row .md3-segmented-button button:hover {
  background: var(--surface-container-high, var(--md-sys-color-surface-container-high));
}

.settings-appearance-row .md3-segmented-button button.active {
  color: var(--on-primary-container, var(--md-sys-color-on-primary-container));
  background: var(--primary-container, var(--md-sys-color-primary-container));
}

.settings-appearance-row .md3-segmented-button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
}

md-outlined-select {
  min-width: 200px;
}

/* --- ESTADO DE LAS HERRAMIENTAS --- */
.tool-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 14px 16px;
  background-color: var(--surface-container, var(--md-sys-color-surface-container-highest));
  border-radius: 18px;
}

.tool-status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--md-sys-color-primary);
}

.tool-status-header md-icon {
  font-size: 20px;
}

.tool-status-details {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: var(--md-sys-color-on-surface-variant);
  font-size: 13px;
}

/* --- AJUSTES ESPECÍFICOS --- */
.settings-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  background-color: var(--surface-container, var(--md-sys-color-surface-container-highest));
  border-radius: 18px;
  cursor: pointer;
}

.settings-switch-row span {
  font-weight: 500;
  color: var(--md-sys-color-on-surface);
}

@media (max-width: 1000px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
}
</style>
