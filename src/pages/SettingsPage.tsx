import type { ReactNode } from 'react';
import type { ToolStatus, ToolsStatus } from './workbench/types';
import { MaterialIcon } from '../components/MaterialIcon'; // <-- Importado aquí
import './SettingsPage.css';

import { useI18n } from '../locales';

// --- COMPONENTES BASE MD3 ---

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="md3-card">
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
        />
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
  appSettings: { cache_enabled: boolean; cache_path: string } | null;
  onSaveAppSettings: (settings: { cache_enabled: boolean; cache_path: string }) => void;
  defaultCacheDir: string;
};

export function SettingsPage(props: SettingsPageProps) {
  const { theme, language, tools, checkingUpdates } = props;
  const { t } = useI18n();

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
          />
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
            value={props.appSettings?.cache_path || props.defaultCacheDir} 
            onInput={(e: any) => {
              if (props.appSettings) {
                props.onSaveAppSettings({ ...props.appSettings, cache_path: e.target.value });
              }
            }} 
            label={t('settings.cachePathPlaceholder')}
            style={{ width: '100%' }}
            disabled={!(props.appSettings?.cache_enabled ?? true)}
          />

          <div className="button-row settings-cache-actions" style={{ marginTop: '16px' }}>
            <md-outlined-button onClick={props.onClearCache}>
              <MaterialIcon name="delete" slot="icon" />
              {t('common.clearCache')}
            </md-outlined-button>
          </div>
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
    </div>
  );
}