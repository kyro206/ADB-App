import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ToolStatus, ToolsStatus } from './workbench/types';
import { getVersion } from '@tauri-apps/api/app';
import { MaterialIcon } from '../components/MaterialIcon';
import { open } from '@tauri-apps/plugin-dialog';
import './SettingsPage.css';

import { useI18n } from '../locales';

// --- COMPONENTES BASE MD3 ---

function Panel({ title, children, style, className }: { title: string; children: ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <section className={`md3-card ${className || ''}`} style={style}>
      <h3 className="md3-title">{title}</h3>
      {children}
    </section>
  );
}

function ToolState({ tool, checking, t }: { tool: ToolStatus; checking: boolean; t: (key: string, params?: Record<string, string | number>) => string }) {
  const state = !tool.available
    ? t('settings.notInstalled')
    : tool.update_available
      ? t('settings.updateAvailable')
      : checking
        ? t('settings.checkingUpdate')
        : tool.update_checked
          ? t('settings.updated')
          : t('settings.checkFailed');

  const iconName = !tool.available
    ? 'error'
    : tool.update_available
      ? 'new_releases'
      : checking
        ? 'sync'
        : tool.update_checked
          ? 'check_circle'
          : 'help';

  return (
    <div className="tool-status">
      <div className="tool-status-header">
        <MaterialIcon name={iconName} size={20} />
        <strong>{state}</strong>
      </div>
      <div className="tool-status-details">
        <span>{t('settings.source')}: {tool.source || '-'}</span>
        <span>{t('settings.installedVersion')}: {tool.version || '-'}</span>
        {tool.latest_version && <span>{t('settings.latestVersion')}: {tool.latest_version}</span>}
      </div>
    </div>
  );
}

// --- TIPOS ---
type ConfigurableTool = 'adb' | 'scrcpy' | 'java';
type InstallableTool = 'adb' | 'scrcpy';

type ToolPanelProps = {
  title: string;
  toolName: InstallableTool;
  tool?: ToolStatus;
  path: string;
  placeholder: string;
  checking: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
  onPathChange: (path: string) => void;
  onSave: (tool: ConfigurableTool, path: string) => void;
  onInstall: (tool: InstallableTool) => void;
  children?: ReactNode;
};

function ToolPanel(props: ToolPanelProps) {
  const { t, toolName } = props;
  const shortTitle = props.title.split(' ')[0];

  return (
    <Panel title={props.title}>
      {props.tool && <ToolState tool={props.tool} checking={props.checking} t={t} />}
      <div className="form-stack">
        <md-outlined-text-field
          value={props.path}
          onInput={(e: any) => props.onPathChange(e.target.value)}
          label={props.placeholder}
          style={{ width: '100%' }}
        >
          <md-icon-button slot="trailing-icon" onClick={async () => {
            const selected = await open({ directory: true, multiple: false });
            if (selected && typeof selected === 'string') {
              props.onPathChange(selected);
            }
          }}>
            <MaterialIcon name="folder_open" />
          </md-icon-button>
        </md-outlined-text-field>
        <div className="button-row">
          <md-filled-button onClick={() => props.onSave(toolName, props.path)}>
            {t('settings.savePath')}
          </md-filled-button>
          <md-outlined-button onClick={() => props.onSave(toolName, '')}>
            {t('settings.autoDetect')}
          </md-outlined-button>
          
          {props.tool?.install_supported && !props.tool.available && (
            <md-filled-button onClick={() => props.onInstall(toolName)}>
              <MaterialIcon name="download" slot="icon" />
              {t('settings.install')} {shortTitle}
            </md-filled-button>
          )}
          {props.tool?.install_supported && props.tool.update_available && (
            <md-filled-button onClick={() => props.onInstall(toolName)}>
              <MaterialIcon name="update" slot="icon" />
              {t('settings.update')} {shortTitle}
            </md-filled-button>
          )}
        </div>
        {props.children}
      </div>
    </Panel>
  );
}

// --- PÁGINA PRINCIPAL ---

type SettingsPageProps = {
  theme: 'light' | 'dark' | 'auto';
  language: 'es' | 'en';
  tools: ToolsStatus | null;
  checkingUpdates: boolean;
  adbPath: string;
  scrcpyPath: string;
  javaPath: string;
  onThemeChange: (theme: 'light' | 'dark' | 'auto') => void;
  onLanguageChange: (language: 'es' | 'en') => void;
  onAdbPathChange: (path: string) => void;
  onScrcpyPathChange: (path: string) => void;
  onJavaPathChange: (path: string) => void;
  onSaveToolPath: (tool: ConfigurableTool, path: string) => void;
  onInstallTool: (tool: InstallableTool) => void;
  onClearCache: () => void;
  appSettings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean } | null;
  onSaveAppSettings: (settings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean }) => void;
  defaultCacheDir: string;
};

export function SettingsPage(props: SettingsPageProps) {
  const { theme, language, tools, checkingUpdates } = props;
  const { t } = useI18n();
  const [appVersion, setAppVersion] = useState<string>('...');
  const [localCachePath, setLocalCachePath] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('Unknown'));
  }, []);

  useEffect(() => {
    if (props.appSettings && localCachePath === null) {
      setLocalCachePath(props.appSettings.cache_path);
    }
  }, [props.appSettings, localCachePath]);

  return (
    <div className="work-grid">
      
      {/* TARJETA DE APARIENCIA E IDIOMA */}
      <Panel title={t('settings.appearance')}>
        <div className="settings-appearance-row">
          <div className="md3-segmented-button">
            {[
              ['light_mode', t('settings.theme.light'), 'light'],
              ['dark_mode', t('settings.theme.dark'), 'dark'],
              ['brightness_auto', t('settings.theme.auto'), 'auto']
            ].map(([icon, label, value]) => (
              <button key={value} className={theme === value ? 'active' : ''} onClick={() => props.onThemeChange(value as any)}>
                <MaterialIcon name={icon} />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <md-outlined-select 
            label={t('settings.language')}
            value={language} 
            onChange={(e: any) => props.onLanguageChange(e.target.value as 'es' | 'en')}
          >
            <md-select-option value="es">
              <div slot="headline">Español</div>
            </md-select-option>
            <md-select-option value="en">
              <div slot="headline">English</div>
            </md-select-option>
          </md-outlined-select>
        </div>
      </Panel>
      
      {/* TARJETAS DE HERRAMIENTAS */}
      <ToolPanel 
        title="ADB" 
        toolName="adb" 
        tool={tools?.adb} 
        path={props.adbPath} 
        placeholder={t('settings.adbPlaceholder')} 
        checking={checkingUpdates} 
        t={t}
        onPathChange={props.onAdbPathChange} 
        onSave={props.onSaveToolPath} 
        onInstall={props.onInstallTool} 
      />
      
      <ToolPanel 
        title="scrcpy" 
        toolName="scrcpy" 
        tool={tools?.scrcpy} 
        path={props.scrcpyPath} 
        placeholder={t('settings.scrcpyPlaceholder')} 
        checking={checkingUpdates} 
        t={t}
        onPathChange={props.onScrcpyPathChange} 
        onSave={props.onSaveToolPath} 
        onInstall={props.onInstallTool} 
      />
      
      {/* TARJETA DE JAVA */}
      <Panel title={t('settings.javaTitle')}>
        <div className="tool-status">
          <div className="tool-status-header">
            <MaterialIcon 
              name={tools?.java.available ? 'check_circle' : 'warning'} 
              size={20} 
            />
            <strong>{tools?.java.available ? t('settings.javaCompatible') : tools?.java.path ? t('settings.javaNotCompatible') : t('settings.javaNotDetected')}</strong>
          </div>
          <div className="tool-status-details">
            <span>{t('settings.installedVersion')}: {tools?.java.version || '-'}</span>
          </div>
        </div>
        <div className="form-stack">
          <md-outlined-text-field 
            value={props.javaPath} 
            onInput={(e: any) => props.onJavaPathChange(e.target.value)} 
            label={t('settings.javaPlaceholder')}
            style={{ width: '100%' }}
          >
            <md-icon-button slot="trailing-icon" onClick={async () => {
              const selected = await open({ directory: true, multiple: false });
              if (selected && typeof selected === 'string') {
                props.onJavaPathChange(selected);
              }
            }}>
              <MaterialIcon name="folder_open" />
            </md-icon-button>
          </md-outlined-text-field>
          <div className="button-row">
            <md-filled-button onClick={() => props.onSaveToolPath('java', props.javaPath)}>{t('settings.savePath')}</md-filled-button>
            <md-outlined-button onClick={() => props.onSaveToolPath('java', '')}>{t('settings.autoDetect')}</md-outlined-button>
            <md-text-button href="https://adoptium.net/es/temurin/releases" target="_blank" rel="noreferrer">
              <MaterialIcon name="open_in_new" slot="icon" />
              {t('settings.downloadTemurin')}
            </md-text-button>
          </div>
        </div>
      </Panel>
      
      {/* TARJETA DE CACHÉ */}
      <Panel title={t('settings.cacheTitle')}>
        <div className="form-stack">          
          <label className="settings-switch-row">
            <span className="md3-body-large">{t('settings.enableCache')}</span>
            <md-switch 
              selected={props.appSettings?.cache_enabled ?? true}
              onChange={(e: any) => {
                if (props.appSettings) {
                  props.onSaveAppSettings({ ...props.appSettings, cache_enabled: e.target.selected });
                }
              }}
            />
          </label>

          <md-outlined-text-field 
            value={localCachePath || props.appSettings?.cache_path || props.defaultCacheDir} 
            onInput={(e: any) => setLocalCachePath(e.target.value)} 
            label={t('settings.cachePathPlaceholder')}
            style={{ width: '100%' }}
          >
            <md-icon-button slot="trailing-icon" onClick={async () => {
              const selected = await open({ directory: true, multiple: false });
              if (selected && typeof selected === 'string') {
                setLocalCachePath(selected);
              }
            }}>
              <MaterialIcon name="folder_open" />
            </md-icon-button>
          </md-outlined-text-field>

          <div className="button-row settings-cache-actions" style={{ marginTop: '16px' }}>
            <md-filled-button onClick={() => {
              if (props.appSettings && localCachePath !== null) {
                props.onSaveAppSettings({ ...props.appSettings, cache_path: localCachePath });
              }
            }}>
              {t('settings.savePath')}
            </md-filled-button>

            <md-outlined-button onClick={() => {
              if (props.appSettings) {
                setLocalCachePath('');
                props.onSaveAppSettings({ ...props.appSettings, cache_path: '' });
              }
            }}>
              {t('common.reset')}
            </md-outlined-button>

            <md-outlined-button onClick={props.onClearCache}>
              <MaterialIcon name="delete" slot="icon" />
              {t('common.clearCache')}
            </md-outlined-button>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--md-sys-color-error)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', margin: '8px 0 0 0' }}>
            <MaterialIcon name="info" size={16} />
            {t('settings.cacheRestartWarning')}
          </p>
        </div>
      </Panel>

      {/* TARJETA DE OPCIONES AVANZADAS */}
      <Panel title={t('settings.advancedTitle')}>
        <div className="form-stack">          
          <label className="settings-switch-row">
            <span className="md3-body-large">{t('settings.killAdbOnExit')}</span>
            <md-switch 
              selected={props.appSettings?.kill_adb_on_exit ?? true}
              onChange={(e: any) => {
                if (props.appSettings) {
                  props.onSaveAppSettings({ ...props.appSettings, kill_adb_on_exit: e.target.selected });
                }
              }}
            />
          </label>
        </div>
      </Panel>

      {/* ACERCA DE */}
      <Panel title={t('settings.aboutTitle')} style={{ gridColumn: '1 / -1' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', padding: '16px 0' }}>
          <img src="/icon.webp" alt="ADB App Logo" style={{ width: '80px', height: '80px', pointerEvents: 'none' }} />
          <div>
            <h2 style={{ margin: '0 0 4px 0' }}>ADB App</h2>
            <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>v{appVersion}</span>
          </div>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)', maxWidth: '400px' }}>
            {t('settings.aboutDisclaimer')}
          </p>
          
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--md-sys-color-surface-container-high)', padding: '12px 24px', borderRadius: '50px' }}>
            <span style={{ fontSize: '14px', color: 'var(--md-sys-color-on-surface-variant)' }}>{t('settings.aboutCreator')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <img 
                src="https://github.com/kyro206.png?size=200" 
                alt="Kyro206" 
                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', background: 'var(--md-sys-color-surface-variant)' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.nextElementSibling) {
                    (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                  }
                }}
              />
              <div style={{ display: 'none', width: '32px', height: '32px', borderRadius: '50%', background: 'var(--md-sys-color-surface-variant)', alignItems: 'center', justifyContent: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>
                <MaterialIcon name="person" size={20} />
              </div>
              <strong style={{ fontSize: '16px' }}>Kyro206</strong>
            </div>
          </div>
          
          <md-text-button href="https://github.com/kyro206/ADB-App" target="_blank" rel="noreferrer" style={{ marginTop: '8px' }}>
            <MaterialIcon name="code" slot="icon" />
            GitHub
          </md-text-button>
        </div>
      </Panel>
    </div>
  );
}