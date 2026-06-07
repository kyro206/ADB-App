import type { Dispatch, SetStateAction } from 'react';
import type { DeviceDetails } from '../context/DeviceContext';
import { MaterialIcon } from '../components/MaterialIcon';
import { aspectRatio, formatRate } from './workbench/utils';
import './DisplayPage.css';

type Setter<T> = Dispatch<SetStateAction<T>>;
type Suggestion = { width: number; height: number; density: number };

interface DisplayPageProps {
  details: DeviceDetails | null;
  deviceType: string;
  width: number;
  setWidth: Setter<number>;
  height: number;
  setHeight: Setter<number>;
  density: number;
  setDensity: Setter<number>;
  timeout: number;
  setTimeout: Setter<number>;
  darkMode: boolean;
  darkModeLoading: boolean;
  suggestions: Suggestion[];
  onToggleDarkMode: () => void;
  onReset: () => void;
  onApply: () => void;
}

function Metric({ icon, label, value, accent = false }: { icon: string; label: string; value: string; accent?: boolean }) {
  return <article className={`display-material-metric ${accent ? 'accent' : ''}`}>
    <MaterialIcon name={icon} filled={accent} />
    <span>{label}</span>
    <strong>{value}</strong>
  </article>;
}

function NumberField({ label, value, min, suffix, onValue }: { label: string; value: number; min: number; suffix: string; onValue: (value: number) => void }) {
  return <md-outlined-text-field label={label} type="number" min={String(min)} suffix-text={suffix} value={value || ''}
    onInput={(event: any) => onValue(Number(event.currentTarget.value))} />;
}

export function DisplayPage(props: DisplayPageProps) {
  const details = props.details;
  const canApply = Boolean(props.width && props.height && props.density && props.timeout);
  const currentRatio = aspectRatio(details?.physical_width || 0, details?.physical_height || 0);
  const configuredRatio = aspectRatio(props.width, props.height);

  return <div className="display-material-page">
    <header className="display-material-hero">
      <div className="display-material-hero__icon"><MaterialIcon name="display_settings" filled /></div>
      <div>
        <span className="display-material-overline">PANTALLA</span>
        <h2>Imagen y comportamiento</h2>
        <p>Consulta las capacidades del dispositivo y adapta resolución, densidad y tiempo de apagado.</p>
      </div>
    </header>

    <section className="display-material-metrics" aria-label="Información de pantalla">
      <Metric icon="devices" label="Tipo de dispositivo" value={details ? props.deviceType : '-'} accent />
      <Metric icon="screenshot_monitor" label="Resolución actual" value={details ? `${details.current_width} × ${details.current_height}` : '-'} />
      <Metric icon="aspect_ratio" label="Resolución física" value={details ? `${details.physical_width} × ${details.physical_height}` : '-'} />
      <Metric icon="density_medium" label="Densidad actual" value={details?.current_density ? `${details.current_density} dpi` : '-'} />
      <Metric icon="straighten" label="Densidad física" value={details?.physical_density ? `${details.physical_density} dpi` : '-'} />
      <Metric icon="speed" label="Frecuencia actual" value={formatRate(details?.refresh_rate_hz || 0)} />
      <Metric icon="width" label="Ancho mínimo" value={details?.smallest_width_dp ? `${details.smallest_width_dp} dp` : '-'} />
      <Metric icon="timer" label="Tiempo de apagado" value={details ? `${Math.round(details.screen_off_timeout_ms / 1000)} s` : '-'} />
    </section>

    <div className="display-material-layout">
      <main className="display-material-main">
        <section className="display-material-card">
          <header><span className="display-material-card__icon"><MaterialIcon name="tune" filled /></span><div><h3>Configuración personalizada</h3><p>Los cambios se aplican directamente mediante ADB.</p></div></header>
          <div className="display-material-fields">
            <NumberField label="Ancho" value={props.width} min={320} suffix="px" onValue={props.setWidth} />
            <NumberField label="Alto" value={props.height} min={320} suffix="px" onValue={props.setHeight} />
            <NumberField label="Densidad" value={props.density} min={120} suffix="dpi" onValue={props.setDensity} />
            <NumberField label="Apagado" value={props.timeout} min={1} suffix="s" onValue={props.setTimeout} />
          </div>
          <div className="display-material-ratio">
            <span><MaterialIcon name="crop" /><small>Relación física</small><strong>{currentRatio}</strong></span>
            <MaterialIcon name="arrow_forward" />
            <span className={currentRatio === configuredRatio ? 'matching' : ''}><MaterialIcon name="preview" /><small>Relación configurada</small><strong>{configuredRatio}</strong></span>
          </div>
          <footer>
            <md-outlined-button disabled={!details} onClick={props.onReset}><span slot="icon"><MaterialIcon name="restart_alt" /></span>Restablecer</md-outlined-button>
            <md-filled-button disabled={!canApply} onClick={props.onApply}><span slot="icon"><MaterialIcon name="check" /></span>Aplicar cambios</md-filled-button>
          </footer>
        </section>

        <section className="display-material-card">
          <header><span className="display-material-card__icon"><MaterialIcon name="auto_awesome" filled /></span><div><h3>Ajustes rápidos</h3><p>Presets proporcionales a la pantalla física del dispositivo.</p></div></header>
          <div className="display-material-presets">
            {props.suggestions.map((item, index) => <md-outlined-button key={`${item.width}-${item.height}`} onClick={() => {
              props.setWidth(item.width); props.setHeight(item.height); props.setDensity(item.density);
            }}>
              <span slot="icon"><MaterialIcon name={index === 0 ? 'high_quality' : index === 3 ? 'data_saver_on' : 'photo_size_select_large'} /></span>
              <span>{item.width} × {item.height}<small>{item.density} dpi</small></span>
            </md-outlined-button>)}
            {!props.suggestions.length && <p className="display-material-empty">Conecta un dispositivo para generar ajustes rápidos.</p>}
          </div>
        </section>
      </main>

      <aside className="display-material-side">
        <section className={`display-material-theme ${props.darkMode ? 'active' : ''}`}>
          <div className="display-material-theme__preview">
            <MaterialIcon name={props.darkMode ? 'dark_mode' : 'light_mode'} filled />
            <span className="display-material-theme__window"><i /><i /><i /></span>
          </div>
          <div className="display-material-theme__copy">
            <span>APARIENCIA DEL DISPOSITIVO</span>
            <h3>{props.darkMode ? 'Modo oscuro' : 'Modo claro'}</h3>
            <p>{props.darkModeLoading ? 'Aplicando el cambio…' : 'Cambia el tema del sistema Android conectado.'}</p>
          </div>
          <label><span>{props.darkMode ? 'Activado' : 'Desactivado'}</span><md-switch selected={props.darkMode || undefined} disabled={!details || props.darkModeLoading || undefined} onClick={props.onToggleDarkMode} /></label>
        </section>

        <section className="display-material-card display-material-rates">
          <header><span className="display-material-card__icon"><MaterialIcon name="motion_photos_on" filled /></span><div><h3>Frecuencias compatibles</h3><p>Modos anunciados por el dispositivo.</p></div></header>
          <div>{details?.supported_refresh_rates_hz?.length
            ? details.supported_refresh_rates_hz.map(rate => <md-assist-chip key={rate} label={formatRate(rate)} />)
            : <span className="display-material-empty">Sin datos disponibles</span>}</div>
        </section>
      </aside>
    </div>
  </div>;
}
