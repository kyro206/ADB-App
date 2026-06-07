import { Panel } from './Panel';
import type { ToolsStatus } from './types';

type SettingsViewProps = {
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
  onSaveToolPath: (tool: 'adb' | 'scrcpy' | 'java', path: string) => void;
  onInstallTool: (tool: 'adb' | 'scrcpy') => void;
  onClearCache: () => void;
};

function ToolState({ tool, checking }: { tool: ToolsStatus['adb']; checking: boolean }) {
  const state = !tool.available ? 'No instalado' : tool.update_available ? 'Actualización disponible' : checking ? 'Comprobando actualización...' : tool.update_checked ? 'Actualizado' : 'No se pudo comprobar';
  return <div className="tool-status"><strong>{state}</strong><span>Origen: {tool.source || '-'}</span><span>Versión instalada: {tool.version || '-'}</span>{tool.latest_version && <span>Última versión: {tool.latest_version}</span>}</div>;
}

export function SettingsView(props: SettingsViewProps) {
  const { theme, language, tools, checkingUpdates, adbPath, scrcpyPath, javaPath } = props;
  return <div className="work-grid">
    <Panel title="Apariencia"><div className="button-row"><button className={theme === 'light' ? 'primary' : ''} onClick={() => props.onThemeChange('light')}>Claro</button><button className={theme === 'dark' ? 'primary' : ''} onClick={() => props.onThemeChange('dark')}>Oscuro</button></div><label className="settings-select">Idioma<select value={language} onChange={event => props.onLanguageChange(event.target.value as 'es' | 'en')}><option value="es">Español</option><option value="en">English</option></select></label></Panel>
    <Panel title="ADB">{tools && <ToolState tool={tools.adb} checking={checkingUpdates} />}<div className="form-stack"><input value={adbPath} onChange={event => props.onAdbPathChange(event.target.value)} placeholder="Ruta al ejecutable adb o su carpeta" /><div className="button-row"><button onClick={() => props.onSaveToolPath('adb', adbPath)}>Guardar ruta</button><button onClick={() => props.onSaveToolPath('adb', '')}>Detección automática</button>{!tools?.adb.available && <button className="primary" onClick={() => props.onInstallTool('adb')}>Instalar ADB</button>}{tools?.adb.update_available && <button className="primary" onClick={() => props.onInstallTool('adb')}>Actualizar ADB</button>}</div></div></Panel>
    <Panel title="scrcpy">{tools && <ToolState tool={tools.scrcpy} checking={checkingUpdates} />}<div className="form-stack"><input value={scrcpyPath} onChange={event => props.onScrcpyPathChange(event.target.value)} placeholder="Ruta al ejecutable scrcpy o su carpeta" /><div className="button-row"><button onClick={() => props.onSaveToolPath('scrcpy', scrcpyPath)}>Guardar ruta</button><button onClick={() => props.onSaveToolPath('scrcpy', '')}>Detección automática</button>{!tools?.scrcpy.available && <button className="primary" onClick={() => props.onInstallTool('scrcpy')}>Instalar scrcpy</button>}{tools?.scrcpy.update_available && <button className="primary" onClick={() => props.onInstallTool('scrcpy')}>Actualizar scrcpy</button>}</div></div></Panel>
    <Panel title="Java para AAB y APKS"><div className="tool-status"><strong>{tools?.java.available ? 'Compatible' : tools?.java.path ? 'Versión no compatible' : 'No detectado'}</strong><span>Origen: {tools?.java.source || '-'}</span><span>Versión: {tools?.java.version || '-'}</span></div><div className="form-stack"><p className="muted">Necesario para procesar archivos .aab y .apks con bundletool. Indica la ruta a java.exe, a la carpeta bin o al directorio de Java.</p><input value={javaPath} onChange={event => props.onJavaPathChange(event.target.value)} placeholder="Ruta a java.exe o su carpeta" /><div className="button-row"><button onClick={() => props.onSaveToolPath('java', javaPath)}>Guardar ruta</button><button onClick={() => props.onSaveToolPath('java', '')}>Detección automática</button><a className="settings-link-button" href="https://adoptium.net/es/temurin/releases" target="_blank" rel="noreferrer">Descargar Temurin LTS</a></div><p className="settings-recommendation">Se recomienda instalar la última versión LTS de Eclipse Temurin. Java 11 o superior es obligatorio para bundletool.</p></div></Panel>
    <Panel title="Caché de aplicaciones"><p className="muted">Solo almacena localmente los nombres e iconos obtenidos de las aplicaciones.</p><div className="button-row settings-cache-actions"><button className="danger" onClick={props.onClearCache}>Borrar caché de nombres e iconos</button></div></Panel>
  </div>;
}
