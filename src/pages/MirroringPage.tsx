import { useState, type Dispatch, type SetStateAction } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { useI18n } from '../locales';
import { save } from '@tauri-apps/plugin-dialog';
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
  { id: 'display', icon: 'smartphone', titleKey: 'mirror.mode.display' },
  { id: 'virtual', icon: 'ad_group', titleKey: 'mirror.mode.virtual' },
  { id: 'camera', icon: 'photo_camera', titleKey: 'mirror.mode.camera' },
];

function Field({ label, value, onValue, type = 'text', placeholder = '', disabled = false, actionIcon, onActionClick }: {
  label: string; value: string; onValue: (value: string) => void; type?: string; placeholder?: string; disabled?: boolean; actionIcon?: string; onActionClick?: () => void;
}) {
  return <md-outlined-text-field label={label} type={type} value={value} placeholder={placeholder} disabled={disabled || undefined}
    onInput={(event: any) => onValue(event.currentTarget.value)}>
    {actionIcon && onActionClick ? (
      <md-icon-button slot="trailing-icon" disabled={disabled || undefined} onClick={onActionClick}><MaterialIcon name={actionIcon} /></md-icon-button>
    ) : value ? (
      <md-icon-button slot="trailing-icon" onClick={() => onValue('')}><MaterialIcon name="close" /></md-icon-button>
    ) : null}
  </md-outlined-text-field>;
}

function Select({ label, value, disabled = false, options, onValue }: {
  label: string; value: string; disabled?: boolean; options: Array<[string, string]>; onValue: (value: string) => void;
}) {
  return <md-outlined-select label={label} value={value} disabled={disabled || undefined}
    onInput={(event: any) => onValue(event.currentTarget.value)}>
    {options.map(([optionValue, text]) => <md-select-option key={optionValue} value={optionValue} selected={value === optionValue || undefined}><div slot="headline">{text}</div></md-select-option>)}
  </md-outlined-select>;
}

function Toggle({ icon, title, checked, disabled = false, onChange }: {
  icon: string; title: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  return <label className={`mirror-material-toggle ${disabled ? 'disabled' : ''}`}>
    <span className="mirror-material-toggle__icon"><MaterialIcon name={icon} filled={checked} /></span>
    <span className="mirror-material-toggle__label">{title}</span>
    <md-switch selected={checked || undefined} disabled={disabled || undefined} onClick={() => !disabled && onChange(!checked)} />
  </label>;
}



export function MirroringPage(props: MirroringPageProps) {
  const { t } = useI18n();
  const [advancedArgs, setAdvancedArgs] = useState('');
  const cameraMode = props.mode === 'camera';
  const inputDisabled = props.readOnly || cameraMode;
  const scrcpyReady = Boolean(props.tools?.scrcpy.available);

  return <div className="mirror-material-page">
    <section className="mirror-material-source-tabs" aria-label={t('mirror.source')}>
      <md-tabs>
        {MODES.map(item => (
          <md-primary-tab 
            key={item.id} 
            active={props.mode === item.id || undefined} 
            onClick={() => props.setMode(item.id as MirrorMode)}
          >
            <MaterialIcon slot="icon" name={item.icon} filled={props.mode === item.id} />
            {t(item.titleKey)}
          </md-primary-tab>
        ))}
      </md-tabs>
    </section>

    <div className="mirror-material-layout">
      <main className="mirror-material-main">
        <section className="mirror-material-card">
          <header><MaterialIcon name="image" filled /><h3>{t('mirror.image.title')}</h3></header>
          <div className="mirror-material-fields">
            {!cameraMode && <Field label={t('mirror.image.maxSize')} type="number" value={props.maxSize} onValue={props.setMaxSize} placeholder={t('mirror.image.noLimit')} />}
            <Field label={t('mirror.image.maxFps')} type="number" value={props.maxFps} onValue={props.setMaxFps} placeholder={t('mirror.image.noLimit')} />
          </div>
          <div className="mirror-material-toggles">
            <Toggle icon="fullscreen" title={t('mirror.image.fullscreen')} checked={props.fullscreen} onChange={props.setFullscreen} />
            <Toggle icon="screen_lock_portrait" title={t('mirror.image.turnScreenOff')} checked={props.turnScreenOff} disabled={cameraMode} onChange={props.setTurnScreenOff} />
          </div>
        </section>

        {props.mode === 'virtual' && <section className="mirror-material-card">
          <header><MaterialIcon name="ad_group" filled /><h3>{t('mirror.virtual.title')}</h3></header>
          <div className="mirror-material-fields three">
            <Field label={t('mirror.virtual.width')} type="number" value={props.virtualWidth} onValue={props.setVirtualWidth} placeholder={t('mirror.virtual.auto')} />
            <Field label={t('mirror.virtual.height')} type="number" value={props.virtualHeight} onValue={props.setVirtualHeight} placeholder={t('mirror.virtual.auto')} />
            <Field label="DPI" type="number" value={props.virtualDpi} onValue={props.setVirtualDpi} placeholder={t('mirror.virtual.auto')} />
          </div>
          <Toggle icon="aspect_ratio" title={t('mirror.virtual.resizable')} checked={props.virtualResizable} onChange={props.setVirtualResizable} />
        </section>}

        {cameraMode && <section className="mirror-material-card">
          <header><MaterialIcon name="photo_camera" filled /><h3>{t('mirror.camera.title')}</h3><div className="mirror-material-spacer"></div><md-icon-button title={t('mirror.camera.refresh')} onClick={props.onRefreshData}><MaterialIcon name="refresh" /></md-icon-button></header>
          <Select label={t('mirror.camera.id')} value={props.cameraId} onValue={props.setCameraId} options={[['', t('mirror.camera.auto')], ...props.cameras.map(camera => [camera, camera] as [string, string])]} />
          <div className="mirror-material-fields">
            <Field label={t('mirror.camera.width')} type="number" value={props.cameraWidth} onValue={props.setCameraWidth} placeholder={t('mirror.virtual.auto')} />
            <Field label={t('mirror.camera.height')} type="number" value={props.cameraHeight} onValue={props.setCameraHeight} placeholder={t('mirror.virtual.auto')} />
          </div>
        </section>}

        <section className="mirror-material-card">
          <header><MaterialIcon name="fiber_manual_record" filled /><h3>{t('mirror.record.title')}</h3></header>
          <div className="mirror-material-toggles">
            <Toggle icon="videocam" title={t('mirror.record.toggle')} checked={props.record} onChange={props.setRecord} />
            <Field 
              label={t('mirror.record.path')} 
              value={props.recordPath} 
              onValue={props.setRecordPath} 
              disabled={!props.record} 
              placeholder="C:\Videos\captura.mkv" 
              actionIcon="folder_open" 
              onActionClick={async () => {
                const selected = await save({ filters: [{ name: 'Video', extensions: ['mkv', 'mp4'] }] });
                if (selected && typeof selected === 'string') {
                  props.setRecordPath(selected);
                }
              }} 
            />
          </div>
        </section>
      </main>

      <aside className="mirror-material-side">
        <section className="mirror-material-card">
          <header><MaterialIcon name="tune" filled /><h3>{t('mirror.input.title')}</h3></header>
          {!cameraMode && <Toggle icon="visibility" title={t('mirror.input.readOnly')} checked={props.readOnly} onChange={props.setReadOnly} />}
          <Select label={t('mirror.input.audio')} value={props.audio} onValue={props.setAudio} options={[['default', t('mirror.input.default')], ['none', t('mirror.input.none')], ['output', t('mirror.input.output')], ['mic', t('mirror.input.mic')]]} />
          <Select label={t('mirror.input.keyboard')} value={props.keyboard} disabled={inputDisabled} onValue={props.setKeyboard} options={[['default', t('mirror.input.default')], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', t('mirror.input.disabled')]]} />
          <Select label={t('mirror.input.mouse')} value={props.mouse} disabled={inputDisabled} onValue={props.setMouse} options={[['default', t('mirror.input.default')], ['sdk', 'SDK'], ['uhid', 'UHID'], ['aoa', 'AOA'], ['disabled', t('mirror.input.disabled')]]} />
        </section>

        {!cameraMode && <section className="mirror-material-card">
          <header><MaterialIcon name="rocket_launch" filled /><h3>{t('mirror.start.title')}</h3></header>
          <Select label={t('mirror.start.app')} value={props.app} onValue={props.setApp}
            options={[['', t('mirror.start.appPlaceholder')], ...props.apps.map(app => [app.package_name, app.display_name || app.package_name] as [string, string])]} />
        </section>}

        <section className="mirror-material-card">
          <header><MaterialIcon name="terminal" /><h3>{t('mirror.advanced.title')}</h3></header>
          <Field label={t('mirror.advanced.args')} value={advancedArgs} onValue={setAdvancedArgs} placeholder="--video-bit-rate=8M" />
        </section>
      </aside>
    </div>

    <footer className="mirror-material-footer">
      <div className="mirror-material-footer__info">
        <MaterialIcon name="info" />
        <span>{cameraMode ? t('mirror.footer.cameraInfo') : t('mirror.footer.audioInfo')}</span>
      </div>
      <div className="mirror-material-footer__actions">
        {advancedArgs && <md-outlined-button disabled={!props.serial || undefined} onClick={() => props.onDirectLaunch(advancedArgs)}><span slot="icon"><MaterialIcon name="terminal" /></span>{t('mirror.advanced.run')}</md-outlined-button>}
        <md-filled-button disabled={!props.serial || !scrcpyReady || undefined} onClick={props.onLaunch}><span slot="icon"><MaterialIcon name="cast" filled /></span>{t('mirror.action.launch')}</md-filled-button>
      </div>
    </footer>
  </div>;
}
