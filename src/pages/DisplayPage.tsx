import type { Dispatch, SetStateAction } from 'react';
import type { DeviceDetails } from '../context/DeviceContext';
import { MaterialIcon } from '../components/MaterialIcon';
import { formatRate } from './workbench/utils';
import './DisplayPage.css';

type Setter<T> = Dispatch<SetStateAction<T>>;
type Suggestion = { width: number; height: number; density: number };

interface DisplayPageProps {
  details: DeviceDetails | null;
  deviceType: string;
  width: number; setWidth: Setter<number>;
  height: number; setHeight: Setter<number>;
  density: number; setDensity: Setter<number>;
  timeout: number; setTimeout: Setter<number>;
  darkMode: boolean;
  darkModeLoading: boolean;
  suggestions: Suggestion[];
  onToggleDarkMode: () => void;
  onSetRefreshRate: (rate: number) => void;
  onReset: () => void;
  onApply: () => void;
}

function InfoCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <article className="display-info-card">
    <MaterialIcon name={icon} filled />
    <span>{label}</span><strong>{value}</strong>
  </article>;
}

function EditCard({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return <article className="display-edit-card">
    <header><span><MaterialIcon name={icon} filled /></span><strong>{label}</strong><MaterialIcon name="edit" /></header>
    {children}
  </article>;
}

function Field({ label, value, min, suffix, onValue }: { label: string; value: number; min: number; suffix: string; onValue: (value: number) => void }) {
  return <md-outlined-text-field label={label} type="number" min={String(min)} suffix-text={suffix} value={value || ''} onInput={(event: any) => onValue(Number(event.currentTarget.value))} />;
}

export function DisplayPage(props: DisplayPageProps) {
  const details = props.details;
  const canApply = Boolean(details && props.width && props.height && props.density && props.timeout);
  return <div className="display-page">
    <section className="display-info-grid">
      <InfoCard icon="devices" label="Tipo" value={details ? props.deviceType : '-'} />
      <InfoCard icon="screenshot_monitor" label="Resolución actual" value={details ? `${details.current_width} × ${details.current_height}` : '-'} />
      <InfoCard icon="aspect_ratio" label="Resolución física" value={details ? `${details.physical_width} × ${details.physical_height}` : '-'} />
      <InfoCard icon="density_medium" label="Densidad física" value={details?.physical_density ? `${details.physical_density} dpi` : '-'} />
      <InfoCard icon="width" label="Ancho mínimo" value={details?.smallest_width_dp ? `${details.smallest_width_dp} dp` : '-'} />
    </section>

    <section className="display-editor-grid">
      <EditCard icon="aspect_ratio" label="Resolución">
        <div className="display-fields two"><Field label="Ancho" value={props.width} min={320} suffix="px" onValue={props.setWidth} /><Field label="Alto" value={props.height} min={320} suffix="px" onValue={props.setHeight} /></div>
      </EditCard>
      <EditCard icon="density_medium" label="Densidad">
        <div className="display-fields"><Field label="Densidad" value={props.density} min={120} suffix="dpi" onValue={props.setDensity} /></div>
      </EditCard>
      <EditCard icon="timer" label="Apagado de pantalla">
        <div className="display-fields"><Field label="Tiempo" value={props.timeout} min={1} suffix="s" onValue={props.setTimeout} /></div>
      </EditCard>
      <article className={`display-dark-card ${props.darkMode ? 'active' : ''} ${props.darkModeLoading ? 'loading' : ''}`}>
        <span className="display-dark-card__icon"><MaterialIcon name={props.darkMode ? 'dark_mode' : 'light_mode'} filled /></span>
        <div><span>Apariencia</span><strong>{props.darkModeLoading ? 'Cambiando modo…' : props.darkMode ? 'Modo oscuro activado' : 'Modo oscuro desactivado'}</strong></div>
        <md-switch selected={props.darkMode || undefined} disabled={!details || props.darkModeLoading || undefined} onClick={props.onToggleDarkMode} />
      </article>
    </section>

    <section className="display-actions">
      <div><MaterialIcon name="tune" /><span>Aplica resolución, densidad y apagado mediante ADB.</span></div>
      <md-outlined-button disabled={!details || undefined} onClick={props.onReset}><span slot="icon"><MaterialIcon name="restart_alt" /></span>Restablecer</md-outlined-button>
      <md-filled-button disabled={!canApply || undefined} onClick={props.onApply}><span slot="icon"><MaterialIcon name="check" /></span>Aplicar</md-filled-button>
    </section>

    <section className="display-bottom-grid">
      <article className="display-panel">
        <header><MaterialIcon name="auto_awesome" filled /><div><strong>Ajustes rápidos</strong><span>Presets proporcionales a la pantalla física.</span></div></header>
        <div className="display-presets">{props.suggestions.map(item => <button key={`${item.width}-${item.height}`} onClick={() => { props.setWidth(item.width); props.setHeight(item.height); props.setDensity(item.density); }}><MaterialIcon name="photo_size_select_large" /><span><strong>{item.width} × {item.height}</strong><small>{item.density} dpi</small></span></button>)}</div>
      </article>
      <article className="display-panel">
        <header><MaterialIcon name="speed" filled /><div><strong>Frecuencias disponibles</strong><span>Selecciona la frecuencia que usará el dispositivo.</span></div></header>
        <div className="display-rates">{details?.supported_refresh_rates_hz?.map(rate => <button className={Math.abs(rate - details.refresh_rate_hz) < .6 ? 'selected' : ''} key={rate} onClick={() => props.onSetRefreshRate(rate)}><MaterialIcon name={Math.abs(rate - details.refresh_rate_hz) < .6 ? 'check_circle' : 'radio_button_unchecked'} />{formatRate(rate)}</button>) || <span>Sin datos disponibles</span>}</div>
      </article>
    </section>
  </div>;
}
