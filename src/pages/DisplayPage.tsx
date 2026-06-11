import type { Dispatch, SetStateAction } from 'react';
import type { DeviceDetails } from '../context/DeviceContext';
import { MaterialIcon } from '../components/MaterialIcon';
import { useI18n } from '../locales';
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
  refreshRate: number;
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
    <header><MaterialIcon name={icon} filled /><h3>{label}</h3></header>
    {children}
  </article>;
}

function Field({ label, value, min, suffix, onValue }: { label: string; value: number; min: number; suffix: string; onValue: (value: number) => void }) {
  return <md-outlined-text-field label={label} type="number" min={String(min)} suffix-text={suffix} value={value || ''} onInput={(event: any) => onValue(Number(event.currentTarget.value))} />;
}

export function DisplayPage(props: DisplayPageProps) {
  const { t } = useI18n();
  const details = props.details;
  const canApply = Boolean(details && props.width && props.height && props.density && props.timeout);
  return <div className="display-page">
    <section className="display-info-grid">
      <InfoCard icon="screenshot_monitor" label={t('display.info.currentRes')} value={details ? `${details.current_width} × ${details.current_height}` : '-'} />
      <InfoCard icon="aspect_ratio" label={t('display.info.physicalRes')} value={details ? `${details.physical_width} × ${details.physical_height}` : '-'} />
      <InfoCard icon="density_medium" label={t('display.info.physicalDensity')} value={details?.physical_density ? `${details.physical_density} dpi` : '-'} />
      <InfoCard icon="width" label={t('display.info.smallestWidth')} value={details?.smallest_width_dp ? `${details.smallest_width_dp} dp` : '-'} />
    </section>

    <section className="display-editor-grid">
      <EditCard icon="aspect_ratio" label={t('display.edit.res')}>
        <div className="display-fields two"><Field label={t('display.edit.width')} value={props.width} min={320} suffix="px" onValue={props.setWidth} /><Field label={t('display.edit.height')} value={props.height} min={320} suffix="px" onValue={props.setHeight} /></div>
      </EditCard>
      <EditCard icon="density_medium" label={t('display.edit.density')}>
        <div className="display-fields"><Field label={t('display.edit.density')} value={props.density} min={120} suffix="dpi" onValue={props.setDensity} /></div>
      </EditCard>
      <EditCard icon="timer" label={t('display.edit.timeout')}>
        <div className="display-fields"><Field label={t('display.edit.time')} value={props.timeout} min={1} suffix="s" onValue={props.setTimeout} /></div>
      </EditCard>
      <article className={`display-dark-card ${props.darkModeLoading ? 'loading' : ''}`}>
        <span className="display-dark-card__icon"><MaterialIcon name={props.darkMode ? 'dark_mode' : 'light_mode'} filled /></span>
        <div><span>{t('display.dark.title')}</span><strong>{props.darkModeLoading ? t('display.dark.changing') : props.darkMode ? t('display.dark.on') : t('display.dark.off')}</strong></div>
        <md-switch selected={props.darkMode || undefined} disabled={!details || props.darkModeLoading || undefined} onClick={props.onToggleDarkMode} />
      </article>
    </section>

    <section className="display-actions">
      <md-outlined-button disabled={!details || undefined} onClick={props.onReset}><span slot="icon"><MaterialIcon name="restart_alt" size={22} /></span>{t('common.reset')}</md-outlined-button>
      <md-filled-button disabled={!canApply || undefined} onClick={props.onApply}><span slot="icon"><MaterialIcon name="check" filled size={22} /></span>{t('common.apply')}</md-filled-button>
    </section>

    <section className="display-bottom-grid">
      <article className="display-panel">
        <header><MaterialIcon name="auto_awesome" filled /><h3>{t('display.presets.title')}</h3></header>
        <div className="display-presets">{props.suggestions.map(item => <button key={`${item.width}-${item.height}`} onClick={() => { props.setWidth(item.width); props.setHeight(item.height); props.setDensity(item.density); }}><MaterialIcon name="photo_size_select_large" /><span><strong>{item.width} × {item.height}</strong><small>{item.density} dpi</small></span></button>)}</div>
      </article>
      <article className="display-panel">
        <header><MaterialIcon name="speed" filled /><h3>{t('display.rates.title')}</h3></header>
        <div className="display-rates">{details?.supported_refresh_rates_hz?.map(rate => <button className={Math.abs(rate - props.refreshRate) < .6 ? 'selected' : ''} key={rate} onClick={() => props.onSetRefreshRate(rate)}><MaterialIcon name={Math.abs(rate - props.refreshRate) < .6 ? 'check_circle' : 'radio_button_unchecked'} />{formatRate(rate)}</button>) || <span>{t('display.rates.empty')}</span>}</div>
      </article>
    </section>
  </div>;
}
