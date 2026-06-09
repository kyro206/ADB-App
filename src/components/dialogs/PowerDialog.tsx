import { useState } from 'react';
import { useI18n } from '../../locales';
import { MaterialIcon } from '../MaterialIcon';
import { AppModal } from './AppModal';
import './PowerDialog.css';

type PowerAction = (label: string, args: string[], exitHint?: string) => void;

export function PowerDialog({ open, busy, onClose, onAction }: { open: boolean; busy: boolean; onClose: () => void; onAction: PowerAction }) {
  const { t } = useI18n();
  const [confirmStep, setConfirmStep] = useState<{ label: string, icon: string, args: string[], exitHint?: string } | null>(null);

  const requestAction = (label: string, icon: string, args: string[], exitHint?: string) => {
    if (label === t('power.btn.screenOff')) {
      onAction(label, args, exitHint);
    } else {
      setConfirmStep({ label, icon, args, exitHint });
    }
  };

  const handleClose = () => {
    if (confirmStep) {
      setConfirmStep(null);
    } else {
      onClose();
    }
  };

  const executeAction = () => {
    if (confirmStep) {
      onAction(confirmStep.label, confirmStep.args, confirmStep.exitHint);
      setConfirmStep(null);
    }
  };

  return <AppModal open={open} onClose={handleClose} width="compact" title={confirmStep ? t('home.power.confirm.title') : t('power.title')} subtitle={confirmStep ? '' : t('power.subtitle')}>
    {confirmStep ? (
      <div className="power-dialog__confirm">
        <MaterialIcon name={confirmStep.icon} className="power-dialog__confirm-icon" />
        <p><strong>{confirmStep.label}</strong></p>
        {confirmStep.exitHint && (
          <p className="power-dialog__hint">
            <MaterialIcon name="info" />
            <span>{t('home.power.confirm.exit')} {confirmStep.exitHint}</span>
          </p>
        )}
        <div className="power-dialog__confirm-actions">
          <md-text-button onClick={() => setConfirmStep(null)}>{t('common.cancel')}</md-text-button>
          <md-filled-button onClick={executeAction}>{t('common.continue')}</md-filled-button>
        </div>
      </div>
    ) : (
      <div className="power-dialog__actions">
        <md-filled-tonal-button disabled={busy || undefined} onClick={() => requestAction(t('power.btn.screenOff'), 'screen_lock_portrait', ['shell', 'input', 'keyevent', 'KEYCODE_SLEEP'])}><span slot="icon"><MaterialIcon name="screen_lock_portrait" /></span>{t('power.btn.screenOff')}</md-filled-tonal-button>
        <md-filled-tonal-button disabled={busy || undefined} onClick={() => requestAction(t('power.btn.reboot'), 'restart_alt', ['reboot'])}><span slot="icon"><MaterialIcon name="restart_alt" /></span>{t('power.btn.reboot')}</md-filled-tonal-button>
        <md-filled-tonal-button disabled={busy || undefined} onClick={() => requestAction(t('power.btn.powerOff'), 'power_settings_new', ['shell', 'reboot', '-p'])}><span slot="icon"><MaterialIcon name="power_settings_new" /></span>{t('power.btn.powerOff')}</md-filled-tonal-button>
        <div className="power-dialog__advanced-title"><MaterialIcon name="warning" /><span><strong>{t('power.advanced.title')}</strong></span></div>
        <md-outlined-button disabled={busy || undefined} onClick={() => requestAction('Recovery', 'health_and_safety', ['reboot', 'recovery'], t('power.hint.recovery'))}><span slot="icon"><MaterialIcon name="health_and_safety" /></span>{t('power.btn.recovery')}</md-outlined-button>
        <md-outlined-button disabled={busy || undefined} onClick={() => requestAction('Bootloader', 'developer_board', ['reboot', 'bootloader'], t('power.hint.bootloader'))}><span slot="icon"><MaterialIcon name="developer_board" /></span>{t('power.btn.bootloader')}</md-outlined-button>
        <md-outlined-button disabled={busy || undefined} onClick={() => requestAction('Fastbootd', 'terminal', ['reboot', 'fastboot'], t('power.hint.fastbootd'))}><span slot="icon"><MaterialIcon name="terminal" /></span>{t('power.btn.fastbootd')}</md-outlined-button>
        <md-outlined-button disabled={busy || undefined} onClick={() => requestAction(t('power.btn.download'), 'download', ['reboot', 'download'], t('power.hint.download'))}><span slot="icon"><MaterialIcon name="download" /></span>{t('power.btn.download')}</md-outlined-button>
      </div>
    )}
  </AppModal>;
}
