import { useState, type Dispatch, type SetStateAction } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import type { AppSummary, MirrorMode, ToolsStatus } from './workbench/types';
import './MirroringPage.css';

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface MirroringPageProps {
  serial: string;
  tools: ToolsStatus | null;
  mode: MirrorMode;
  setMode: Setter<MirrorMode>;
  fullscreen: boolean;
  setFullscreen: Setter<boolean>;
  turnScreenOff: boolean;
  setTurnScreenOff: Setter<boolean>;
  readOnly: boolean;
  setReadOnly: Setter<boolean>;
  maxSize: string;
  setMaxSize: Setter<string>;
  maxFps: string;
  setMaxFps: Setter<string>;
  audio: string;
  setAudio: Setter<string>;
  keyboard: string;
  setKeyboard: Setter<string>;
  mouse: string;
  setMouse: Setter<string>;
  record: boolean;
  setRecord: Setter<boolean>;
  recordPath: string;
  setRecordPath: Setter<string>;
  startApp: boolean;
  setStartApp: Setter<boolean>;
  app: string;
  setApp: Setter<string>;
  apps: AppSummary[];
  virtualWidth: string;
  setVirtualWidth: Setter<string>;
  virtualHeight: string;
  setVirtualHeight: Setter<string>;
  virtualDpi: string;
  setVirtualDpi: Setter<string>;
  virtualResizable: boolean;
  setVirtualResizable: Setter<boolean>;
  cameraId: string;
  setCameraId: Setter<string>;
  cameraWidth: string;
  setCameraWidth: Setter<string>;
  cameraHeight: string;
  setCameraHeight: Setter<string>;
  cameras: string[];
  onRefreshData: () => void;
  onLaunch: () => void;
  onDirectLaunch: (args: string) => void;
}

const modes: Array<{ id: MirrorMode; icon: string; title: string; detail: string }> = [
  { id: 'display', icon: 'smartphone', title: 'Pantalla principal', detail: 'Duplica la pantalla actual' },
  { id: 'virtual', icon: 'ad_group', title: 'Pantalla virtual', detail: 'Crea una pantalla independiente' },
  { id: 'camera', icon: 'photo_camera', title: 'Cámara', detail: 'Transmite una cámara del dispositivo' },
];

function Field({ label, value, onValue, type = 'text', placeholder = '', disabled = false }: {
  label: string; value: string; onValue: (value: string) => void; type?: string; placeholder?: string; disabled?: boolean;
}) {
  return <md-outlined-text-field label={label} type={type} value={value} placeholder={placeholder} disabled={disabled || undefined}
    onInput={(event: any) => onValue(event.currentTarget.value)} />;
}

function Select({ label, value, disabled = false, options, onValue }: {
  label: string; value: string; disabled?: boolean; options: Array<[string, string]>; onValue: (value: string) => void;
}) {
  return <md-outlined-select label={label} value={value} disabled={disabled || undefined}
    onInput={(event: any) => onValue(event.currentTarget.value)}>
    {options.map(([optionValue, text]) => <md-select-option key={optionValue} value={optionValue} selected={value === optionValue || undefined}><div slot="headline">{text}</div></md-select-option>)}
  </md-outlined-select>;
}

function Toggle({ icon, title, detail, checked, disabled = false, onChange }: {
  icon: string; title: string; detail: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  return <label className={`mirror-material-toggle ${disabled ? 'disabled' : ''}`}>
    <span className="mirror-material-toggle__icon"><MaterialIcon name={icon} /></span>
    <span><strong>{title}</strong><small>{detail}</small></span>
    <md-switch selected={checked || undefined} disabled={disabled || undefined} onClick={() => !disabled && onChange(!checked)} />
  </label>;
}

function SourceButton({ item, active, onClick }: { item: typeof modes[number]; active: boolean; onClick: () => void }) {
  const content = <>
    <span slot="icon" className="mirror-material-source__icon"><MaterialIcon name={item.icon} filled={active} /></span>
    <span className="mirror-material-source__copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
    <span slot="trailing-icon"><MaterialIcon name={active ? 'radio_button_checked' : 'radio_button_unchecked'} /></span>
  </>;
  return active
    ? <md-filled-tonal-button className="mirror-material-source__button active" onClick={onClick}>{content}</md-filled-tonal-button>
    : <md-outlined-button className="mirror-material-source__button" onClick={onClick}>{content}</md-outlined-button>;
}

export function MirroringPage(props: MirroringPageProps) {
  const [advancedArgs, setAdvancedArgs] = useState('');
  const cameraMode = props.mode === 'camera';
  const inputDisabled = props.readOnly || cameraMode;
  const scrcpyReady = Boolean(props.tools?.scrcpy.available);

  return <div className="mirror-material-page">
    <section className="mirror-material-source" aria-label="Fuente de vídeo">
      {modes.map(item => <SourceButton key={item.id} item={item} active={props.mode === item.id} onClick={() => props.setMode(item.id)} />)}
    </section>

    <div className="mirror-material-layout">
      <main className="mirror-material-main">
        <section className="mirror-material-card">
          <header><MaterialIcon name="image" filled /><div><h3>Imagen</h3><p>Resolución, fluidez y comportamiento de la ventana.</p></div></header>
          <div className="mirror-material-fields">
            {!cameraMode && <Field label="Tamaño máximo (px)" type="number" value={props.maxSize} onValue={props.setMaxSize} placeholder="Sin límite" />}
            <Field label="FPS máximos" type="number" value={props.maxFps} onValue={props.setMaxFps} placeholder="Sin límite" />
          </div>
          <div className="mirror-material-toggles">
            <Toggle icon="fullscreen" title="Pantalla completa" detail="Abrir scrcpy ocupando toda la pantalla" checked={props.fullscreen} onChange={props.setFullscreen} />
            <Toggle icon="screen_lock_portrait" title="Apagar pantalla física" detail="Mantiene activa la vista en el equipo" checked={props.turnScreenOff} disabled={cameraMode} onChange={props.setTurnScreenOff} />
          </div>
        </section>

        {props.mode === 'virtual' && <section className="mirror-material-card">
          <header><MaterialIcon name="ad_group" filled /><div><h3>Pantalla virtual</h3><p>Crea un escritorio Android adicional con sus propias dimensiones.</p></div></header>
          <div className="mirror-material-fields three">
            <Field label="Ancho" type="number" value={props.virtualWidth} onValue={props.setVirtualWidth} placeholder="Automático" />
            <Field label="Alto" type="number" value={props.virtualHeight} onValue={props.setVirtualHeight} placeholder="Automático" />
            <Field label="DPI" type="number" value={props.virtualDpi} onValue={props.setVirtualDpi} placeholder="Automático" />
          </div>
          <Toggle icon="aspect_ratio" title="Ventana redimensionable" detail="Adapta la pantalla virtual al cambiar el tamaño" checked={props.virtualResizable} onChange={props.setVirtualResizable} />
        </section>}

        {cameraMode && <section className="mirror-material-card">
          <header><MaterialIcon name="photo_camera" filled /><div><h3>Cámara</h3><p>Selecciona la cámara y su resolución de transmisión.</p></div><md-icon-button title="Actualizar cámaras" onClick={props.onRefreshData}><MaterialIcon name="refresh" /></md-icon-button></header>
          <Select label="Cámara / ID" value={props.cameraId} onValue={props.setCameraId} options={[['', 'Selección automática'], ...props.cameras.map(camera => [camera, camera] as [string, string])]} />
          <div className="mirror-material-fields">
            <Field label="Ancho de cámara" type="number" value={props.cameraWidth} onValue={props.setCameraWidth} placeholder="Automático" />
            <Field label="Alto de cámara" type="number" value={props.cameraHeight} onValue={props.setCameraHeight} placeholder="Automático" />
          </div>
        </section>}

        <section className="mirror-material-card">
          <header><MaterialIcon name="fiber_manual_record" filled /><div><h3>Grabación</h3><p>Guarda la sesión de scrcpy directamente en un archivo.</p></div></header>
          <Toggle icon="videocam" title="Grabar esta vista" detail="La grabación comienza al abrir scrcpy" checked={props.record} onChange={props.setRecord} />
          <Field label="Ruta del archivo de grabación" value={props.recordPath} onValue={props.setRecordPath} disabled={!props.record} placeholder="C:\Videos\captura.mkv" />
        </section>
      </main>

      <aside className="mirror-material-side">
        <section className="mirror-material-card">
          <header><MaterialIcon name="tune" filled /><div><h3>Entrada y sonido</h3><p>Controla cómo interactúa el equipo con Android.</p></div></header>
          {!cameraMode && <Toggle icon="visibility" title="Solo ver" detail="Deshabilita teclado, ratón y control táctil" checked={props.readOnly} onChange={props.setReadOnly} />}
          <Select label="Audio" value={props.audio} onValue={props.setAudio} options={[['default', 'Por defecto'], ['none', 'Sin audio'], ['output', 'Salida del dispositivo'], ['mic', 'Micrófono']]} />
          <Select label="Teclado" value={props.keyboard} disabled={inputDisabled} onValue={props.setKeyboard} options={[['default', 'Por defecto'], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', 'Deshabilitado']]} />
          <Select label="Ratón" value={props.mouse} disabled={inputDisabled} onValue={props.setMouse} options={[['default', 'Por defecto'], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', 'Deshabilitado']]} />
        </section>

        {!cameraMode && <section className="mirror-material-card">
          <header><MaterialIcon name="rocket_launch" filled /><div><h3>Inicio</h3><p>Abre directamente una aplicación al iniciar.</p></div></header>
          <Toggle icon="apps" title="Abrir una aplicación" detail="Inicia la app seleccionada junto a scrcpy" checked={props.startApp} onChange={props.setStartApp} />
          <Select label="Aplicación" value={props.app} disabled={!props.startApp} onValue={props.setApp}
            options={[['', 'Selecciona una aplicación'], ...props.apps.map(app => [app.package_name, app.display_name || app.package_name] as [string, string])]} />
          <md-outlined-button onClick={props.onRefreshData}><span slot="icon"><MaterialIcon name="refresh" /></span>Actualizar lista</md-outlined-button>
        </section>}

        <section className="mirror-material-card">
          <header><MaterialIcon name="terminal" /><div><h3>Argumentos avanzados</h3><p>Ejecuta scrcpy con parámetros personalizados.</p></div></header>
          <Field label="Argumentos adicionales" value={advancedArgs} onValue={setAdvancedArgs} placeholder="--video-bit-rate=8M" />
          <md-outlined-button disabled={!props.serial || undefined} onClick={() => props.onDirectLaunch(advancedArgs)}><span slot="icon"><MaterialIcon name="terminal" /></span>Ejecutar directamente</md-outlined-button>
        </section>
      </aside>
    </div>

    <footer className="mirror-material-footer">
      <span><MaterialIcon name="info" />{cameraMode ? 'La cámara requiere Android 12 o superior y no permite control.' : 'El audio del dispositivo requiere Android 11 o superior.'}</span>
      <md-filled-button disabled={!props.serial || !scrcpyReady || undefined} onClick={props.onLaunch}><span slot="icon"><MaterialIcon name="cast" /></span>Abrir vista con scrcpy</md-filled-button>
    </footer>
  </div>;
}
