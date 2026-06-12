import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ToolStatus, ToolsStatus } from './workbench/types';
import { getVersion, getName } from '@tauri-apps/api/app';
import { MaterialIcon } from '../components/MaterialIcon';
import { open } from '@tauri-apps/plugin-dialog';
import './SettingsPage.css';

import { useI18n } from '../locales';
import { AppModal } from '../components/dialogs/AppModal';
import { APACHE_LICENSE_2_0, MIT_LICENSE } from '../utils/licenseTexts';

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
  appSettings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; theme: string; language: string } | null;
  onSaveAppSettings: (settings: { cache_enabled: boolean; cache_path: string; kill_adb_on_exit: boolean; theme: string; language: string }) => void;
  defaultCacheDir: string;
};

export function SettingsPage(props: SettingsPageProps) {
  const { theme, language, tools, checkingUpdates } = props;
  const { t } = useI18n();
  const [appVersion, setAppVersion] = useState<string>('...');
  const [appName, setAppName] = useState('ADB App');
  const [localCachePath, setLocalCachePath] = useState<string | null>(null);
  
  type LicenseInfo = { name: string; url: string; licenseType: string; licenseText: string };
  const [licensesOpen, setLicensesOpen] = useState(false);

  const LICENSES: LicenseInfo[] = [
    { name: 'ADB', url: 'https://android.googlesource.com/platform/packages/modules/adb/', licenseType: 'Apache License 2.0', licenseText: APACHE_LICENSE_2_0 },
    { name: 'scrcpy', url: 'https://github.com/Genymobile/scrcpy', licenseType: 'Apache License 2.0', licenseText: APACHE_LICENSE_2_0 },
    { name: 'Bundletool', url: 'https://github.com/google/bundletool', licenseType: 'Apache License 2.0', licenseText: APACHE_LICENSE_2_0 },
    { name: 'Material Web', url: 'https://github.com/material-components/material-web', licenseType: 'Apache License 2.0', licenseText: APACHE_LICENSE_2_0 },
    { name: 'Tauri', url: 'https://github.com/tauri-apps/tauri', licenseType: 'MIT / Apache 2.0', licenseText: MIT_LICENSE + '\n\n---\n\n' + APACHE_LICENSE_2_0 },
    { name: 'React', url: 'https://github.com/facebook/react', licenseType: 'MIT License', licenseText: MIT_LICENSE }
  ];

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('Unknown'));
    getName().then(setAppName).catch(() => {});
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '20px', textAlign: 'left', padding: '16px 0' }}>
          
          {/* Cabecera (Icono, Nombre, Versión, Botón GitHub) */}
          <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <img src="/icon.webp" style={{ width: '64px', height: '64px', pointerEvents: 'none' }} alt="ADB App" />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <h2 style={{ margin: '0 0 2px 0', fontSize: '24px', lineHeight: '1.2' }}>{appName}</h2>
                <span style={{ color: 'var(--md-sys-color-on-surface-variant)', fontSize: '14px' }}>{appVersion}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <md-filled-button href="https://github.com/kyro206/ADB-App" target="_blank" rel="noreferrer">
                <MaterialIcon name="code" slot="icon" />
                GitHub
              </md-filled-button>
              <md-outlined-button onClick={() => setLicensesOpen(true)}>
                <MaterialIcon name="gavel" slot="icon" />
                {t('settings.aboutLicenses')}
              </md-outlined-button>
            </div>
          </div>

          {/* Aviso de responsabilidad */}
          <p style={{ fontSize: '13px', color: 'var(--md-sys-color-error)', display: 'flex', alignItems: 'center', gap: '6px', margin: '0 0 8px 0' }}>
            <MaterialIcon name="warning" size={16} />
            {t('settings.aboutDisclaimer')}
          </p>
          
          {/* Creador */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
            <div style={{ position: 'relative' }}>
              <img 
                src="https://github.com/kyro206.png?size=200" 
                alt="Kyro206" 
                style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', background: 'var(--md-sys-color-surface-variant)' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  if (e.currentTarget.nextElementSibling) {
                    (e.currentTarget.nextElementSibling as HTMLElement).style.display = 'flex';
                  }
                }}
              />
              <div style={{ display: 'none', width: '40px', height: '40px', borderRadius: '50%', background: 'var(--md-sys-color-surface-variant)', alignItems: 'center', justifyContent: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>
                <MaterialIcon name="person" size={24} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>
                {t('settings.aboutCreator')}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <strong style={{ fontSize: '15px', color: 'var(--md-sys-color-on-surface)' }}>Kyro206</strong>
                <md-icon-button href="https://github.com/kyro206" target="_blank" rel="noopener noreferrer" title="GitHub Profile">
                  <MaterialIcon name="open_in_new" size={16} />
                </md-icon-button>
              </div>
            </div>
          </div>
          
        </div>
      </Panel>
      <AppModal open={licensesOpen} onClose={() => setLicensesOpen(false)} title={t('settings.aboutLicenses')} width="large">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          <div style={{ 
            background: 'var(--md-sys-color-surface-container)', 
            padding: '16px', 
            borderRadius: '12px', 
            overflowY: 'auto',
            border: '1px solid var(--md-sys-color-outline-variant)'
          }}>
            {LICENSES.map((lic, index) => (
              <div key={lic.name} style={{ marginBottom: index === LICENSES.length - 1 ? 0 : '32px' }}>
                <div style={{ borderBottom: '1px dashed var(--md-sys-color-outline-variant)', paddingBottom: '8px', marginBottom: '12px' }}>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: 'var(--md-sys-color-on-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {lic.name}
                    <md-icon-button href={lic.url} target="_blank" rel="noopener noreferrer" title="Código original">
                      <MaterialIcon name="open_in_new" size={18} />
                    </md-icon-button>
                  </h4>
                  <span style={{ fontSize: '12px', color: 'var(--md-sys-color-on-surface-variant)' }}>{lic.licenseType}</span>
                </div>
                <div style={{ fontSize: '12px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--md-sys-color-on-surface-variant)' }}>
                  {lic.licenseText}
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppModal>
    </div>
  );
}