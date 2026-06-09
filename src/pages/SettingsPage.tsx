import type { ReactNode } from 'react';
import type { ToolStatus, ToolsStatus } from './workbench/types';
import { MaterialIcon } from '../components/MaterialIcon'; // <-- Importado aquí
import './SettingsPage.css';

// --- SISTEMA DE TRADUCCIONES ---
const translations = {
  es: {
    appearance: 'Apariencia',
    language: 'Idioma',
    spanish: 'Español',
    english: 'English',
    notInstalled: 'No instalado',
    updateAvailable: 'Actualización disponible',
    checkingUpdate: 'Comprobando actualización...',
    updated: 'Actualizado',
    checkFailed: 'No se pudo comprobar',
    source: 'Origen',
    installedVersion: 'Versión instalada',
    latestVersion: 'Última versión',
    savePath: 'Guardar ruta',
    autoDetect: 'Detección automática',
    install: 'Instalar',
    update: 'Actualizar',
    adbPlaceholder: 'Ruta al ejecutable adb o su carpeta',
    scrcpyPlaceholder: 'Ruta al ejecutable scrcpy o su carpeta',
    javaTitle: 'Java para AAB',
    javaCompatible: 'Compatible',
    javaNotCompatible: 'Versión no compatible',
    javaNotDetected: 'No detectado',
    javaDesc: 'Necesario para procesar archivos .aab con bundletool. Se recomienda instalar la última versión LTS de Eclipse Temurin. Java 11 o superior es obligatorio para bundletool.',
    javaPlaceholder: 'Ruta a java.exe o su carpeta',
    downloadTemurin: 'Descargar Temurin LTS',
    cacheTitle: 'Caché de aplicaciones',
    cacheDesc: 'Solo almacena localmente los nombres e iconos obtenidos de las aplicaciones.',
    clearCache: 'Borrar caché',
    enableCache: 'Habilitar caché',
    cachePathPlaceholder: 'Ruta personalizada para caché (vacío = por defecto)',
  },
  en: {
    appearance: 'Appearance',
    language: 'Language',
    spanish: 'Español',
    english: 'English',
    notInstalled: 'Not installed',
    updateAvailable: 'Update available',
    checkingUpdate: 'Checking for updates...',
    updated: 'Up to date',
    checkFailed: 'Check failed',
    source: 'Source',
    installedVersion: 'Installed version',
    latestVersion: 'Latest version',
    savePath: 'Save path',
    autoDetect: 'Auto detect',
    install: 'Install',
    update: 'Update',
    adbPlaceholder: 'Path to adb executable or folder',
    scrcpyPlaceholder: 'Path to scrcpy executable or folder',
    javaTitle: 'Java for AAB',
    javaCompatible: 'Compatible',
    javaNotCompatible: 'Incompatible version',
    javaNotDetected: 'Not detected',
    javaDesc: 'Required to process .aab files with bundletool. Installing the latest LTS version of Eclipse Temurin is recommended. Java 11 or higher is required.',
    javaPlaceholder: 'Path to java.exe or folder',
    downloadTemurin: 'Download Temurin LTS',
    cacheTitle: 'Application Cache',
    cacheDesc: 'Only stores locally the names and icons obtained from the applications.',
    clearCache: 'Clear cache',
    enableCache: 'Enable cache',
    cachePathPlaceholder: 'Custom cache path (empty = default)',
  }
};

// --- COMPONENTES BASE MD3 ---

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="md3-card">
      <h3 className="md3-title">{title}</h3>
      {children}
    </section>
  );
}

function ToolState({ tool, checking, t }: { tool: ToolStatus; checking: boolean; t: typeof translations['es'] }) {
  const state = !tool.available
    ? t.notInstalled
    : tool.update_available
      ? t.updateAvailable
      : checking
        ? t.checkingUpdate
        : tool.update_checked
          ? t.updated
          : t.checkFailed;

  return (
    <div className="tool-status">
      <div className="tool-status-header">
        <MaterialIcon name="check_circle" size={20} />
        <strong>{state}</strong>
      </div>
      <div className="tool-status-details">
        <span>{t.source}: {tool.source || '-'}</span>
        <span>{t.installedVersion}: {tool.version || '-'}</span>
        {tool.latest_version && <span>{t.latestVersion}: {tool.latest_version}</span>}
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
  t: typeof translations['es'];
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
            {t.savePath}
          </md-filled-button>
          <md-outlined-button onClick={() => props.onSave(toolName, '')}>
            {t.autoDetect}
          </md-outlined-button>
          
          {props.tool?.install_supported && !props.tool.available && (
            <md-filled-button onClick={() => props.onInstall(toolName)}>
              <MaterialIcon name="download" slot="icon" />
              {t.install} {shortTitle}
            </md-filled-button>
          )}
          {props.tool?.install_supported && props.tool.update_available && (
            <md-filled-button onClick={() => props.onInstall(toolName)}>
              <MaterialIcon name="update" slot="icon" />
              {t.update} {shortTitle}
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
  theme: 'light' | 'dark';
  language: 'es' | 'en';
  tools: ToolsStatus | null;
  checkingUpdates: boolean;
  adbPath: string;
  scrcpyPath: string;
  javaPath: string;
  onThemeChange: (theme: 'light' | 'dark') => void;
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
  const t = translations[language];

  const handleThemeToggle = () => {
    props.onThemeChange(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className="work-grid">
      
      {/* TARJETA DE APARIENCIA E IDIOMA */}
      <Panel title={t.appearance}>
        <div className="settings-appearance-row">
          <div className="theme-toggle">
            <span className="muted">{theme === 'light' ? 'Modo Claro' : 'Modo Oscuro'}</span>
            <md-icon-button onClick={handleThemeToggle}>
              {/* Cambia el icono usando tu propio componente */}
              <MaterialIcon name={theme === 'light' ? 'dark_mode' : 'light_mode'} />
            </md-icon-button>
          </div>

          <md-outlined-select 
            label={t.language}
            value={language} 
            onChange={(e: any) => props.onLanguageChange(e.target.value as 'es' | 'en')}
          >
            <md-select-option value="es">
              <div slot="headline">{t.spanish}</div>
            </md-select-option>
            <md-select-option value="en">
              <div slot="headline">{t.english}</div>
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
        placeholder={t.adbPlaceholder} 
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
        placeholder={t.scrcpyPlaceholder} 
        checking={checkingUpdates} 
        t={t}
        onPathChange={props.onScrcpyPathChange} 
        onSave={props.onSaveToolPath} 
        onInstall={props.onInstallTool} 
      />
      
      {/* TARJETA DE JAVA */}
      <Panel title={t.javaTitle}>
        <div className="tool-status">
          <div className="tool-status-header">
            <MaterialIcon 
              name={tools?.java.available ? 'check_circle' : 'warning'} 
              size={20} 
            />
            <strong>{tools?.java.available ? t.javaCompatible : tools?.java.path ? t.javaNotCompatible : t.javaNotDetected}</strong>
          </div>
          <div className="tool-status-details">
            <span>{t.source}: {tools?.java.source || '-'}</span>
            <span>{t.installedVersion}: {tools?.java.version || '-'}</span>
          </div>
        </div>
        <div className="form-stack">
          <p className="muted md3-body-medium">{t.javaDesc}</p>
          <md-outlined-text-field 
            value={props.javaPath} 
            onInput={(e: any) => props.onJavaPathChange(e.target.value)} 
            label={t.javaPlaceholder}
            style={{ width: '100%' }}
          />
          <div className="button-row">
            <md-filled-button onClick={() => props.onSaveToolPath('java', props.javaPath)}>{t.savePath}</md-filled-button>
            <md-outlined-button onClick={() => props.onSaveToolPath('java', '')}>{t.autoDetect}</md-outlined-button>
            <md-text-button href="https://adoptium.net/es/temurin/releases" target="_blank" rel="noreferrer">
              <MaterialIcon name="open_in_new" slot="icon" />
              {t.downloadTemurin}
            </md-text-button>
          </div>
        </div>
      </Panel>
      
      {/* TARJETA DE CACHÉ */}
      <Panel title={t.cacheTitle}>
        <div className="form-stack">
          <p className="muted md3-body-medium">{t.cacheDesc}</p>
          
          <label className="settings-switch-row">
            <span className="md3-body-large">{t.enableCache}</span>
            <md-switch 
              selected={props.appSettings?.cache_enabled ?? true}
              onChange={(e: any) => {
                if (props.appSettings) {
                  props.onSaveAppSettings({ ...props.appSettings, cache_enabled: e.target.selected });
                }
              }}
            />
          </label>

          <div className="settings-appearance-row" style={{ marginTop: '8px' }}>
            <md-outlined-text-field 
              value={props.appSettings?.cache_path ?? ''} 
              onInput={(e: any) => {
                if (props.appSettings) {
                  props.onSaveAppSettings({ ...props.appSettings, cache_path: e.target.value });
                }
              }} 
              label={t.cachePathPlaceholder}
              supportingText={props.appSettings?.cache_path ? '' : `Actual: ${props.defaultCacheDir}`}
              style={{ width: '100%' }}
              disabled={!(props.appSettings?.cache_enabled ?? true)}
            />
          </div>

          <div className="button-row settings-cache-actions" style={{ marginTop: '16px' }}>
            <md-outlined-button onClick={props.onClearCache}>
              <MaterialIcon name="delete" slot="icon" />
              {t.clearCache}
            </md-outlined-button>
          </div>
        </div>
      </Panel>
    </div>
  );
}