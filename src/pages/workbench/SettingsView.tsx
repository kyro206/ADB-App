import { Panel } from './Panel';
import type { ToolStatus, ToolsStatus } from './types';

type ConfigurableTool = 'adb' | 'scrcpy' | 'java' | 'aapt2';
type InstallableTool = 'adb' | 'scrcpy' | 'aapt2';

type SettingsViewProps = {
  theme: 'light' | 'dark';
  language: 'es' | 'en';
  tools: ToolsStatus | null;
  checkingUpdates: boolean;
  adbPath: string;
  scrcpyPath: string;
  javaPath: string;
  aapt2Path: string;
  onThemeChange: (theme: 'light' | 'dark') => void;
  onLanguageChange: (language: 'es' | 'en') => void;
  onAdbPathChange: (path: string) => void;
  onScrcpyPathChange: (path: string) => void;
  onJavaPathChange: (path: string) => void;
  onAapt2PathChange: (path: string) => void;
  onSaveToolPath: (tool: ConfigurableTool, path: string) => void;
  onInstallTool: (tool: InstallableTool) => void;
  onClearCache: () => void;
};

function ToolState({ tool, checking }: { tool: ToolStatus; checking: boolean }) {
  const state = !tool.available
    ? 'No instalado'
    : tool.update_available
      ? 'Actualización disponible'
      : checking
        ? 'Comprobando actualización...'
        : tool.update_checked
          ? 'Actualizado'
          : 'No se pudo comprobar';
  return <div className="tool-status">
    <strong>{state}</strong>
    <span>Origen: {tool.source || '-'}</span>
    <span>Versión instalada: {tool.version || '-'}</span>
    {tool.latest_version && <span>Última versión: {tool.latest_version}</span>}
  </div>;
}

type ToolPanelProps = {
  title: string;
  toolName: InstallableTool;
  tool?: ToolStatus;
  path: string;
  description?: string;
  placeholder: string;
  checking: boolean;
  onPathChange: (path: string) => void;
  onSave: (tool: ConfigurableTool, path: string) => void;
  onInstall: (tool: InstallableTool) => void;
  children?: React.ReactNode;
};

function ToolPanel(props: ToolPanelProps) {
  return <Panel title={props.title}>
    {props.tool && <ToolState tool={props.tool} checking={props.checking} />}
    <div className="form-stack">
      {props.description && <p className="muted">{props.description}</p>}
      <input value={props.path} onChange={event => props.onPathChange(event.target.value)} placeholder={props.placeholder} />
      <div className="button-row">
        <button onClick={() => props.onSave(props.toolName, props.path)}>Guardar ruta</button>
        <button onClick={() => props.onSave(props.toolName, '')}>Detección automática</button>
        {props.tool?.install_supported && !props.tool.available && <button className="primary" onClick={() => props.onInstall(props.toolName)}>Instalar {props.title.split(' ')[0]}</button>}
        {props.tool?.install_supported && props.tool.update_available && <button className="primary" onClick={() => props.onInstall(props.toolName)}>Actualizar {props.title.split(' ')[0]}</button>}
      </div>
      {props.children}
    </div>
  </Panel>;
}

export function SettingsView(props: SettingsViewProps) {
  const { theme, language, tools, checkingUpdates } = props;
  return <div className="work-grid">
    <Panel title="Apariencia">
      <div className="button-row">
        <button className={theme === 'light' ? 'primary' : ''} onClick={() => props.onThemeChange('light')}>Claro</button>
        <button className={theme === 'dark' ? 'primary' : ''} onClick={() => props.onThemeChange('dark')}>Oscuro</button>
      </div>
      <label className="settings-select">Idioma
        <select value={language} onChange={event => props.onLanguageChange(event.target.value as 'es' | 'en')}>
          <option value="es">Español</option><option value="en">English</option>
        </select>
      </label>
    </Panel>
    <ToolPanel title="ADB" toolName="adb" tool={tools?.adb} path={props.adbPath} placeholder="Ruta al ejecutable adb o su carpeta" checking={checkingUpdates} onPathChange={props.onAdbPathChange} onSave={props.onSaveToolPath} onInstall={props.onInstallTool} />
    <ToolPanel title="scrcpy" toolName="scrcpy" tool={tools?.scrcpy} path={props.scrcpyPath} placeholder="Ruta al ejecutable scrcpy o su carpeta" checking={checkingUpdates} onPathChange={props.onScrcpyPathChange} onSave={props.onSaveToolPath} onInstall={props.onInstallTool} />
    <ToolPanel
      title="AAPT2 para nombres e iconos"
      toolName="aapt2"
      tool={tools?.aapt2}
      path={props.aapt2Path}
      placeholder="Ruta al ejecutable aapt2 o su carpeta"
      checking={checkingUpdates}
      description="Lee el nombre y el icono de los APK. Se detecta desde Android SDK, PATH, instalaciones anteriores o la copia gestionada por ADB App."
      onPathChange={props.onAapt2PathChange}
      onSave={props.onSaveToolPath}
      onInstall={props.onInstallTool}
    >
      <p className="settings-recommendation">ADB App descarga el binario oficial de Google Maven correspondiente a Windows, macOS o Linux.</p>
    </ToolPanel>
    <Panel title="Java para AAB y APKS">
      <div className="tool-status">
        <strong>{tools?.java.available ? 'Compatible' : tools?.java.path ? 'Versión no compatible' : 'No detectado'}</strong>
        <span>Origen: {tools?.java.source || '-'}</span><span>Versión: {tools?.java.version || '-'}</span>
      </div>
      <div className="form-stack">
        <p className="muted">Necesario para procesar archivos .aab y .apks con bundletool. Indica la ruta a java.exe, a la carpeta bin o al directorio de Java.</p>
        <input value={props.javaPath} onChange={event => props.onJavaPathChange(event.target.value)} placeholder="Ruta a java.exe o su carpeta" />
        <div className="button-row">
          <button onClick={() => props.onSaveToolPath('java', props.javaPath)}>Guardar ruta</button>
          <button onClick={() => props.onSaveToolPath('java', '')}>Detección automática</button>
          <a className="settings-link-button" href="https://adoptium.net/es/temurin/releases" target="_blank" rel="noreferrer">Descargar Temurin LTS</a>
        </div>
        <p className="settings-recommendation">Se recomienda instalar la última versión LTS de Eclipse Temurin. Java 11 o superior es obligatorio para bundletool.</p>
      </div>
    </Panel>
    <Panel title="Caché de aplicaciones">
      <p className="muted">Solo almacena localmente los nombres e iconos obtenidos de las aplicaciones.</p>
      <div className="button-row settings-cache-actions"><button className="danger" onClick={props.onClearCache}>Borrar caché de nombres e iconos</button></div>
    </Panel>
  </div>;
}
