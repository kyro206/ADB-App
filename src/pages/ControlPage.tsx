import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MaterialIcon } from '../components/MaterialIcon';
import { words } from './workbench/utils';
import type { MediaVolumeState, SoundMode } from './workbench/types';
import './ControlPage.css';

// Declaración para que TypeScript reconozca los Web Components de Material sin quejarse
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'md-slider': any;
      'md-switch': any;
    }
  }
}

interface ControlPageProps {
  serial: string;
  run: (args: string[], success?: string) => Promise<string | undefined>;
  setStatus: (status: string) => void;
  setBusy: (busy: boolean) => void;
}

export function ControlPage({ serial, run, setStatus, setBusy }: ControlPageProps) {
  const [controlBrightness, setControlBrightness] = useState(128);
  const [controlVolume, setControlVolume] = useState(7);
  const [controlVolumeMax, setControlVolumeMax] = useState(15);
  const [rotationAuto, setRotationAuto] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [soundMode, setSoundMode] = useState<SoundMode>('NORMAL');

const loadDeviceState = () => {
    if (!serial) return;

    invoke<MediaVolumeState>('get_media_volume', { serial }).then(value => {
      setControlVolume(value.level);
      setControlVolumeMax(value.maximum);
    }).catch(() => undefined);

    run(['shell', 'settings', 'get', 'system', 'screen_brightness']).then(res => {
      if (res && !isNaN(Number(res))) setControlBrightness(Number(res.trim()));
    });

    run(['shell', 'settings', 'get', 'system', 'accelerometer_rotation']).then(res => {
      if (res) setRotationAuto(res.trim() === '1');
    });

    run(['shell', 'settings', 'get', 'system', 'user_rotation']).then(res => {
      if (res && !isNaN(Number(res))) setRotation(Number(res.trim()));
    });

    run(['shell', 'settings', 'get', 'global', 'mode_ringer']).then(res => {
      const mode = res?.trim();
      if (mode === '0') setSoundMode('SILENT');
      else if (mode === '1') setSoundMode('VIBRATE');
      else if (mode === '2') setSoundMode('NORMAL');
    });
  };

  useEffect(() => {
    loadDeviceState();
  }, [serial]);
  const sendKey = (code: string) => run(['shell', 'input', 'keyevent', code]);

  const applyMediaVolume = async (value: number) => {
    if (!serial) { setStatus('Selecciona un dispositivo'); return; }
    const safeValue = Math.max(0, Math.min(value, controlVolumeMax));
    setControlVolume(safeValue);
    setBusy(true);
    try {
      setStatus(await invoke<string>('set_media_volume', { serial, volume: safeValue }));
    } catch (error) { setStatus(String(error)); } finally { setBusy(false); }
  };

  const setDeviceRotation = async (value: number) => {
    setRotation(value);
    setRotationAuto(false);
    await run(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
    await run(['shell', 'settings', 'put', 'system', 'user_rotation', String(value)]);
  };

  const setDeviceSoundMode = async (mode: SoundMode) => {
    setSoundMode(mode);
    await run(['shell', 'cmd', 'audio', 'set-ringer-mode', mode]);
  };

  return (
    <div className="control-page">
      <div className="control-settings">
        {/* BRILLO Y VOLUMEN */}
        <section className="md3-card">
          <div className="md3-card-header">
            <h3>Pantalla y Sonido</h3>
          </div>
          <div className="md3-slider-group">
            <label className="md3-slider-container">
              <div className="md3-slider-info">
                <MaterialIcon name="light_mode" />
                <span>Brillo</span>
                <strong>{controlBrightness} / 255</strong>
              </div>
              <md-slider 
                min="0" 
                max="255" 
                value={controlBrightness}
                onInput={(event: any) => setControlBrightness(Number(event.target.value))}
                onChange={(event: any) => run(['shell', 'settings', 'put', 'system', 'screen_brightness', event.target.value])}
              ></md-slider>
            </label>

            <label className="md3-slider-container">
              <div className="md3-slider-info">
                <MaterialIcon name="volume_up" />
                <span>Volumen multimedia</span>
                <strong>{controlVolume} / {controlVolumeMax}</strong>
              </div>
              <md-slider 
                min="0" 
                max={controlVolumeMax} 
                value={controlVolume}
                onInput={(event: any) => setControlVolume(Number(event.target.value))}
                onChange={(event: any) => applyMediaVolume(Number(event.target.value))}
              ></md-slider>
            </label>
          </div>
        </section>

        {/* ROTACIÓN */}
        <section className="md3-card">
          <div className="md3-card-header">
            <h3>Orientación</h3>
            <label className="md3-switch-container">
              <span>Automática</span>
              <md-switch 
                selected={rotationAuto} 
                onChange={async (event: any) => { 
                  const isAuto = event.target.selected;
                  setRotationAuto(isAuto); 
                  await run(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', isAuto ? '1' : '0']); 
                }}
              ></md-switch>
            </label>
          </div>
          <div className="md3-segmented-button">
            {[['stay_current_portrait', 'Vertical', 0], ['stay_current_landscape', 'Horizontal', 1], ['stay_current_portrait', 'Vertical inv.', 2], ['stay_current_landscape', 'Horizontal inv.', 3]].map(([icon, label, value]) => (
              <button key={String(value)} className={!rotationAuto && rotation === value ? 'active' : ''} onClick={() => setDeviceRotation(Number(value))}>
                <MaterialIcon name={String(icon)} className={`rotation-${value}`} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* MODO DE SONIDO */}
        <section className="md3-card">
          <div className="md3-card-header">
            <h3>Perfil de sonido</h3>
          </div>
          <div className="md3-segmented-button">
            <button className={soundMode === 'NORMAL' ? 'active' : ''} onClick={() => setDeviceSoundMode('NORMAL')}>
              <MaterialIcon name="volume_up" filled={soundMode === 'NORMAL'} />
              <span>Sonido</span>
            </button>
            <button className={soundMode === 'VIBRATE' ? 'active' : ''} onClick={() => setDeviceSoundMode('VIBRATE')}>
              <MaterialIcon name="vibration" filled={soundMode === 'VIBRATE'} />
              <span>Vibración</span>
            </button>
            <button className={soundMode === 'SILENT' ? 'active' : ''} onClick={() => setDeviceSoundMode('SILENT')}>
              <MaterialIcon name="volume_off" filled={soundMode === 'SILENT'} />
              <span>Silencio</span>
            </button>
          </div>
        </section>

        {/* INTRODUCIR TEXTO */}
        <section className="md3-card">
          <div className="md3-card-header">
            <h3>Entrada de texto y comandos</h3>
          </div>
          <form className="md3-text-form" onSubmit={event => { event.preventDefault(); run(['shell', 'input', 'text', String(new FormData(event.currentTarget).get('text')).replace(/ /g, '%s')]); }}>
            <div className="md3-text-field">
              <input name="text" placeholder=" " required />
              <label>Texto a enviar (espacios incluidos)</label>
            </div>
            <button className="md3-btn-filled">Enviar</button>
          </form>

          <details className="md3-details">
            <summary>Entrada avanzada ADB</summary>
            <form className="md3-text-form" onSubmit={event => { event.preventDefault(); run(['shell', 'input', ...words(String(new FormData(event.currentTarget).get('args')))]); }}>
              <div className="md3-text-field">
                <input name="args" placeholder=" " required />
                <label>Ej: tap 500 800 / swipe 100 500 900 500 300</label>
              </div>
              <button className="md3-btn-tonal">Ejecutar</button>
            </form>
          </details>
        </section>
      </div>

      {/* MANDO ANDROID TV */}
      <aside className="md3-remote-container">
        <div className="md3-remote">
          <div className="md3-remote-header">
            <h3>Android TV</h3>
            <button className="md3-remote-power" title="Encender o apagar" onClick={() => sendKey('KEYCODE_POWER')}>
              <MaterialIcon name="power_settings_new" />
            </button>
          </div>

          <div className="md3-remote-dpad">
            <button className="dpad-btn dpad-up" onClick={() => sendKey('KEYCODE_DPAD_UP')}><MaterialIcon name="keyboard_arrow_up" /></button>
            <button className="dpad-btn dpad-left" onClick={() => sendKey('KEYCODE_DPAD_LEFT')}><MaterialIcon name="keyboard_arrow_left" /></button>
            <button className="dpad-btn dpad-ok" onClick={() => sendKey('KEYCODE_DPAD_CENTER')}>OK</button>
            <button className="dpad-btn dpad-right" onClick={() => sendKey('KEYCODE_DPAD_RIGHT')}><MaterialIcon name="keyboard_arrow_right" /></button>
            <button className="dpad-btn dpad-down" onClick={() => sendKey('KEYCODE_DPAD_DOWN')}><MaterialIcon name="keyboard_arrow_down" /></button>
          </div>

          <div className="md3-remote-main-actions">
            <button className="md3-icon-btn-tonal" title="Volver" onClick={() => sendKey('KEYCODE_BACK')}><MaterialIcon name="arrow_back" /></button>
            <button className="md3-icon-btn-tonal assistant-btn" title="Asistente" onClick={() => sendKey('KEYCODE_ASSIST')}><MaterialIcon name="assistant" filled /></button>
            <button className="md3-icon-btn-tonal" title="Inicio" onClick={() => sendKey('KEYCODE_HOME')}><MaterialIcon name="home" filled /></button>
          </div>

          <div className="md3-remote-volume-row">
            <button className="md3-icon-btn-tonal mute-btn" title="Silenciar" onClick={() => sendKey('KEYCODE_VOLUME_MUTE')}>
              <MaterialIcon name="volume_off" />
            </button>
            <div className="md3-volume-pill">
              <button onClick={() => applyMediaVolume(controlVolume - 1)}><MaterialIcon name="remove" /></button>
              <div className="volume-label"><span>{controlVolume}</span><small>VOL</small></div>
              <button onClick={() => applyMediaVolume(controlVolume + 1)}><MaterialIcon name="add" /></button>
            </div>
          </div>

          <div className="md3-remote-media-grid">
            <button onClick={() => sendKey('KEYCODE_APP_SWITCH')}><MaterialIcon name="recent_actors" /><span>Recientes</span></button>
            <button onClick={() => sendKey('KEYCODE_MENU')}><MaterialIcon name="menu" /><span>Menú</span></button>
            <button onClick={() => sendKey('KEYCODE_INFO')}><MaterialIcon name="info" /><span>Info</span></button>
            
            <button onClick={() => sendKey('KEYCODE_MEDIA_PREVIOUS')}><MaterialIcon name="skip_previous" filled /><span>Anterior</span></button>
            <button onClick={() => sendKey('KEYCODE_MEDIA_PLAY_PAUSE')}><MaterialIcon name="play_pause" filled /><span>Play/Pausa</span></button>
            <button onClick={() => sendKey('KEYCODE_MEDIA_NEXT')}><MaterialIcon name="skip_next" filled /><span>Siguiente</span></button>
            
            <button onClick={() => sendKey('KEYCODE_GUIDE')}><MaterialIcon name="tv" /><span>Guía</span></button>
            <button onClick={() => sendKey('KEYCODE_CHANNEL_DOWN')}><MaterialIcon name="remove" /><span>CH -</span></button>
            <button onClick={() => sendKey('KEYCODE_CHANNEL_UP')}><MaterialIcon name="add" /><span>CH +</span></button>
          </div>
        </div>
      </aside>
    </div>
  );
}