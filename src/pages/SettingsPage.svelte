<script lang="ts" module>
import * as m from '../paraglide/messages';

  export type ConfigurableTool = 'adb' | 'scrcpy' | 'java';
  export type InstallableTool = 'adb' | 'scrcpy';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { getVersion, getName } from '@tauri-apps/api/app';
  import { open } from '@tauri-apps/plugin-dialog';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import type { ToolStatus, ToolsStatus } from './workbench/types';
  
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import AppModal from '../components/dialogs/AppModal.svelte';
  import Logo from '../components/Logo.svelte';
  import { languages, getLanguageName } from '../context/i18n.svelte';
  import { APACHE_LICENSE_2_0, MIT_LICENSE, ANDROID_LOGO_LICENSE } from '../utils/licenseTexts';
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
    appSettings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; material_you_enabled: boolean; material_you_background_tint: boolean; theme: string; language: string } | null;
    onSaveAppSettings: (settings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; material_you_enabled: boolean; material_you_background_tint: boolean; theme: string; language: string }) => void;
    defaultCacheDir: string;
  }>();

  let appVersion = $state('...');
  let appName = $state('ADB App');
  let localCachePath = $state<string | null>(null);
  let licensesOpen = $state(false);

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
</script>

<div class="settings-grid">
  
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
        <!-- svelte-ignore a11y_missing_attribute -->
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

      <label class="settings-switch-row" style="width: 100%; box-sizing: border-box;">
        <span class="md3-body-large">{m.settings_materialYouWallpaper()}</span>
        <!-- svelte-ignore a11y_missing_attribute -->
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
        <!-- svelte-ignore a11y_missing_attribute -->
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
          value={path}
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
          <md-outlined-button onclick={() => onSaveToolPath(toolName, '')}>
            {m.settings_autoDetect()}
          </md-outlined-button>
          
          {#if tool?.install_supported && !tool.available}
            <md-filled-button onclick={() => onInstallTool(toolName)}>
              <MaterialIcon name="download" slot="icon" />
              {m.settings_install()} {title.split(' ')[0]}
            </md-filled-button>
          {/if}
          {#if tool?.install_supported && tool.update_available}
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
  {@render toolPanel("scrcpy", "scrcpy", tools?.scrcpy, scrcpyPath, m.settings_scrcpyPlaceholder(), p => scrcpyPath = p)}
  
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
        value={javaPath} 
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
  
  <section class="settings-card">
    <h3 class="settings-title">{m.settings_cacheTitle()}</h3>
    <div class="form-stack">          
      <label class="settings-switch-row">
        <span class="md3-body-large">{m.settings_enableCache()}</span>
        <!-- svelte-ignore a11y_missing_attribute -->
        <md-switch 
          selected={appSettings?.cache_enabled ?? true}
          onchange={(e: any) => {
            if (appSettings) {
              onSaveAppSettings({ ...appSettings, cache_enabled: e.target.selected });
            }
          }}
        ></md-switch>
      </label>

      <md-outlined-text-field 
        value={localCachePath || appSettings?.cache_path || defaultCacheDir} 
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

        <md-outlined-button onclick={onClearCache}>
          <MaterialIcon name="delete" slot="icon" />
          {m.common_clearCache()}
        </md-outlined-button>
      </div>
      <p style="font-size: 13px; color: var(--md-sys-color-error); margin-top: 8px; display: flex; align-items: center; gap: 6px; margin: 8px 0 0 0">
        <MaterialIcon name="info" size={16} />
        {m.settings_cacheRestartWarning()}
      </p>
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
          <!-- svelte-ignore a11y_missing_attribute -->
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
        <div style="position: relative">
          <img 
            src="https://github.com/kyro206.png?size=200" 
            alt="Kyro206" 
            draggable="false"
            style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: var(--md-sys-color-surface-variant); user-select: none; -webkit-user-drag: none;"
            onerror={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
              if (e.currentTarget.nextElementSibling) {
                (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
              }
            }}
          />
          <div style="display: none; width: 40px; height: 40px; border-radius: 50%; background: var(--md-sys-color-surface-variant); align-items: center; justify-content: center; color: var(--md-sys-color-on-surface-variant)">
            <MaterialIcon name="person" size={24} />
          </div>
        </div>
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
