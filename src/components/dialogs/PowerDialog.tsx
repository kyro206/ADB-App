import { useI18n } from '../../locales';
import { MaterialIcon } from '../MaterialIcon';
import { AppModal } from './AppModal';
import './PowerDialog.css';

type PowerAction = (label: string, args: string[], exitHint?: string) => void;

export function PowerDialog({ open, busy, onClose, onAction }: { open: boolean; busy: boolean; onClose: () => void; onAction: PowerAction }) {
  const { t } = useI18n();
  return <AppModal open={open} onClose={onClose} width="compact" title={t('power.title')} subtitle={t('power.subtitle')}>
    <div className="power-dialog__actions">
      <md-filled-tonal-button disabled={busy || undefined} onClick={() => onAction(t('power.action.screenOff'), ['shell', 'input', 'keyevent', 'KEYCODE_SLEEP'])}><span slot="icon"><MaterialIcon name="screen_lock_portrait" /></span>{t('power.btn.screenOff')}</md-filled-tonal-button>
      <md-filled-tonal-button disabled={busy || undefined} onClick={() => onAction(t('power.action.reboot'), ['reboot'])}><span slot="icon"><MaterialIcon name="restart_alt" /></span>{t('power.btn.reboot')}</md-filled-tonal-button>
      <md-filled-tonal-button disabled={busy || undefined} onClick={() => onAction(t('power.action.powerOff'), ['shell', 'reboot', '-p'])}><span slot="icon"><MaterialIcon name="power_settings_new" /></span>{t('power.btn.powerOff')}</md-filled-tonal-button>
      <div className="power-dialog__advanced-title"><MaterialIcon name="warning" /><span><strong>{t('power.advanced.title')}</strong><small>{t('power.advanced.desc')}</small></span></div>
      <md-outlined-button disabled={busy || undefined} onClick={() => onAction('Recovery', ['reboot', 'recovery'], t('power.hint.recovery'))}><span slot="icon"><MaterialIcon name="health_and_safety" /></span>{t('power.btn.recovery')}</md-outlined-button>
      <md-outlined-button disabled={busy || undefined} onClick={() => onAction('Bootloader', ['reboot', 'bootloader'], t('power.hint.bootloader'))}><span slot="icon"><MaterialIcon name="developer_board" /></span>{t('power.btn.bootloader')}</md-outlined-button>
      <md-outlined-button disabled={busy || undefined} onClick={() => onAction('Fastbootd', ['reboot', 'fastboot'], t('power.hint.fastbootd'))}><span slot="icon"><MaterialIcon name="terminal" /></span>{t('power.btn.fastbootd')}</md-outlined-button>
      <md-outlined-button disabled={busy || undefined} onClick={() => onAction(t('power.action.download'), ['reboot', 'download'], t('power.hint.download'))}><span slot="icon"><MaterialIcon name="download" /></span>{t('power.btn.download')}</md-outlined-button>
    </div>
  </AppModal>;
}
