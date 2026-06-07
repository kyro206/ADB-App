import { MaterialIcon } from '../MaterialIcon';
import { AppModal } from './AppModal';
import './PowerDialog.css';

type PowerAction = (label: string, args: string[], exitHint?: string) => void;

export function PowerDialog({ open, busy, onClose, onAction }: { open: boolean; busy: boolean; onClose: () => void; onAction: PowerAction }) {
  return <AppModal open={open} onClose={onClose} width="compact" title="Opciones de energía" subtitle="Controla el estado del dispositivo conectado.">
    <div className="power-dialog__actions">
      <md-filled-tonal-button disabled={busy || undefined} onClick={() => onAction('apagar pantalla', ['shell', 'input', 'keyevent', 'KEYCODE_SLEEP'])}><span slot="icon"><MaterialIcon name="screen_lock_portrait" /></span>Apagar pantalla</md-filled-tonal-button>
      <md-filled-tonal-button disabled={busy || undefined} onClick={() => onAction('reiniciar Android', ['reboot'])}><span slot="icon"><MaterialIcon name="restart_alt" /></span>Reiniciar</md-filled-tonal-button>
      <md-filled-tonal-button disabled={busy || undefined} onClick={() => onAction('apagar dispositivo', ['shell', 'reboot', '-p'])}><span slot="icon"><MaterialIcon name="power_settings_new" /></span>Apagar</md-filled-tonal-button>
      <div className="power-dialog__advanced-title"><MaterialIcon name="warning" /><span><strong>Modos de arranque</strong><small>Estos modos requieren una confirmación antes de reiniciar.</small></span></div>
      <md-outlined-button disabled={busy || undefined} onClick={() => onAction('Recovery', ['reboot', 'recovery'], 'Selecciona Reboot system now.')}><span slot="icon"><MaterialIcon name="health_and_safety" /></span>Recovery</md-outlined-button>
      <md-outlined-button disabled={busy || undefined} onClick={() => onAction('Bootloader', ['reboot', 'bootloader'], 'Ejecuta fastboot reboot o selecciona Start.')}><span slot="icon"><MaterialIcon name="developer_board" /></span>Bootloader</md-outlined-button>
      <md-outlined-button disabled={busy || undefined} onClick={() => onAction('Fastbootd', ['reboot', 'fastboot'], 'Ejecuta fastboot reboot.')}><span slot="icon"><MaterialIcon name="terminal" /></span>Fastbootd</md-outlined-button>
      <md-outlined-button disabled={busy || undefined} onClick={() => onAction('modo descarga', ['reboot', 'download'], 'La forma de salir depende del fabricante.')}><span slot="icon"><MaterialIcon name="download" /></span>Modo descarga</md-outlined-button>
    </div>
  </AppModal>;
}
