import { useState, type Dispatch, type SetStateAction } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { useI18n } from '../locales';
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

const MODES = [
  // We'll map these with t() inside the component
  { id: 'display', icon: 'smartphone', titleKey: 'mirror.mode.display', detailKey: 'mirror.mode.display.desc' },
  { id: 'virtual', icon: 'ad_group', titleKey: 'mirror.mode.virtual', detailKey: 'mirror.mode.virtual.desc' },
  { id: 'camera', icon: 'photo_camera', titleKey: 'mirror.mode.camera', detailKey: 'mirror.mode.camera.desc' },
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

function SourceButton({ item, active, onClick, t }: { item: any; active: boolean; onClick: () => void; t: any }) {
  const content = <>
    <span slot="icon" className="mirror-material-source__icon"><MaterialIcon name={item.icon} filled={active} /></span>
    <span className="mirror-material-source__copy"><strong>{t(item.titleKey)}</strong><small>{t(item.detailKey)}</small></span>
    <span slot="trailing-icon"><MaterialIcon name={active ? 'radio_button_checked' : 'radio_button_unchecked'} /></span>
  </>;
  return active
    ? <md-filled-tonal-button className="mirror-material-source__button active" onClick={onClick}>{content}</md-filled-tonal-button>
    : <md-outlined-button className="mirror-material-source__button" onClick={onClick}>{content}</md-outlined-button>;
}

export function MirroringPage(props: MirroringPageProps) {
  const { t } = useI18n();
  const [advancedArgs, setAdvancedArgs] = useState('');
  const cameraMode = props.mode === 'camera';
  const inputDisabled = props.readOnly || cameraMode;
  const scrcpyReady = Boolean(props.tools?.scrcpy.available);

  return <div className="mirror-material-page">
    <section className="mirror-material-source" aria-label={t('mirror.source')}>
      {MODES.map(item => <SourceButton key={item.id} item={item} active={props.mode === item.id} onClick={() => props.setMode(item.id as MirrorMode)} t={t} />)}
    </section>

    <div className="mirror-material-layout">
      <main className="mirror-material-main">
        <section className="mirror-material-card">
          <header><MaterialIcon name="image" filled /><div><h3>{t('mirror.image.title')}</h3><p>{t('mirror.image.desc')}</p></div></header>
          <div className="mirror-material-fields">
            {!cameraMode && <Field label={t('mirror.image.maxSize')} type="number" value={props.maxSize} onValue={props.setMaxSize} placeholder={t('mirror.image.noLimit')} />}
            <Field label={t('mirror.image.maxFps')} type="number" value={props.maxFps} onValue={props.setMaxFps} placeholder={t('mirror.image.noLimit')} />
          </div>
          <div className="mirror-material-toggles">
            <Toggle icon="fullscreen" title={t('mirror.image.fullscreen')} detail={t('mirror.image.fullscreen.desc')} checked={props.fullscreen} onChange={props.setFullscreen} />
            <Toggle icon="screen_lock_portrait" title={t('mirror.image.turnScreenOff')} detail={t('mirror.image.turnScreenOff.desc')} checked={props.turnScreenOff} disabled={cameraMode} onChange={props.setTurnScreenOff} />
          </div>
        </section>

        {props.mode === 'virtual' && <section className="mirror-material-card">
          <header><MaterialIcon name="ad_group" filled /><div><h3>{t('mirror.virtual.title')}</h3><p>{t('mirror.virtual.desc')}</p></div></header>
          <div className="mirror-material-fields three">
            <Field label={t('mirror.virtual.width')} type="number" value={props.virtualWidth} onValue={props.setVirtualWidth} placeholder={t('mirror.virtual.auto')} />
            <Field label={t('mirror.virtual.height')} type="number" value={props.virtualHeight} onValue={props.setVirtualHeight} placeholder={t('mirror.virtual.auto')} />
            <Field label="DPI" type="number" value={props.virtualDpi} onValue={props.setVirtualDpi} placeholder={t('mirror.virtual.auto')} />
          </div>
          <Toggle icon="aspect_ratio" title={t('mirror.virtual.resizable')} detail={t('mirror.virtual.resizable.desc')} checked={props.virtualResizable} onChange={props.setVirtualResizable} />
        </section>}

        {cameraMode && <section className="mirror-material-card">
          <header><MaterialIcon name="photo_camera" filled /><div><h3>{t('mirror.camera.title')}</h3><p>{t('mirror.camera.desc')}</p></div><md-icon-button title={t('mirror.camera.refresh')} onClick={props.onRefreshData}><MaterialIcon name="refresh" /></md-icon-button></header>
          <Select label={t('mirror.camera.id')} value={props.cameraId} onValue={props.setCameraId} options={[['', t('mirror.camera.auto')], ...props.cameras.map(camera => [camera, camera] as [string, string])]} />
          <div className="mirror-material-fields">
            <Field label={t('mirror.camera.width')} type="number" value={props.cameraWidth} onValue={props.setCameraWidth} placeholder={t('mirror.virtual.auto')} />
            <Field label={t('mirror.camera.height')} type="number" value={props.cameraHeight} onValue={props.setCameraHeight} placeholder={t('mirror.virtual.auto')} />
          </div>
        </section>}

        <section className="mirror-material-card">
          <header><MaterialIcon name="fiber_manual_record" filled /><div><h3>{t('mirror.record.title')}</h3><p>{t('mirror.record.desc')}</p></div></header>
          <Toggle icon="videocam" title={t('mirror.record.toggle')} detail={t('mirror.record.toggle.desc')} checked={props.record} onChange={props.setRecord} />
          <Field label={t('mirror.record.path')} value={props.recordPath} onValue={props.setRecordPath} disabled={!props.record} placeholder="C:\Videos\captura.mkv" />
        </section>
      </main>

      <aside className="mirror-material-side">
        <section className="mirror-material-card">
          <header><MaterialIcon name="tune" filled /><div><h3>{t('mirror.input.title')}</h3><p>{t('mirror.input.desc')}</p></div></header>
          {!cameraMode && <Toggle icon="visibility" title={t('mirror.input.readOnly')} detail={t('mirror.input.readOnly.desc')} checked={props.readOnly} onChange={props.setReadOnly} />}
          <Select label={t('mirror.input.audio')} value={props.audio} onValue={props.setAudio} options={[['default', t('mirror.input.default')], ['none', t('mirror.input.none')], ['output', t('mirror.input.output')], ['mic', t('mirror.input.mic')]]} />
          <Select label={t('mirror.input.keyboard')} value={props.keyboard} disabled={inputDisabled} onValue={props.setKeyboard} options={[['default', t('mirror.input.default')], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', t('mirror.input.disabled')]]} />
          <Select label={t('mirror.input.mouse')} value={props.mouse} disabled={inputDisabled} onValue={props.setMouse} options={[['default', t('mirror.input.default')], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', t('mirror.input.disabled')]]} />
        </section>

        {!cameraMode && <section className="mirror-material-card">
          <header><MaterialIcon name="rocket_launch" filled /><div><h3>{t('mirror.start.title')}</h3><p>{t('mirror.start.desc')}</p></div></header>
          <Toggle icon="apps" title={t('mirror.start.toggle')} detail={t('mirror.start.toggle.desc')} checked={props.startApp} onChange={props.setStartApp} />
          <Select label={t('mirror.start.app')} value={props.app} disabled={!props.startApp} onValue={props.setApp}
            options={[['', t('mirror.start.appPlaceholder')], ...props.apps.map(app => [app.package_name, app.display_name || app.package_name] as [string, string])]} />
          <md-outlined-button onClick={props.onRefreshData}><span slot="icon"><MaterialIcon name="refresh" /></span>{t('mirror.start.refresh')}</md-outlined-button>
        </section>}

        <section className="mirror-material-card">
          <header><MaterialIcon name="terminal" /><div><h3>{t('mirror.advanced.title')}</h3><p>{t('mirror.advanced.desc')}</p></div></header>
          <Field label={t('mirror.advanced.args')} value={advancedArgs} onValue={setAdvancedArgs} placeholder="--video-bit-rate=8M" />
          <md-outlined-button disabled={!props.serial || undefined} onClick={() => props.onDirectLaunch(advancedArgs)}><span slot="icon"><MaterialIcon name="terminal" /></span>{t('mirror.advanced.run')}</md-outlined-button>
        </section>
      </aside>
    </div>

    <footer className="mirror-material-footer">
      <span><MaterialIcon name="info" />{cameraMode ? t('mirror.footer.cameraInfo') : t('mirror.footer.audioInfo')}</span>
      <md-filled-button disabled={!props.serial || !scrcpyReady || undefined} onClick={props.onLaunch}><span slot="icon"><MaterialIcon name="cast" /></span>{t('mirror.action.launch')}</md-filled-button>
    </footer>
  </div>;
}
