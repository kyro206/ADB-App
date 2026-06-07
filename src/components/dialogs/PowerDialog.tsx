import { MaterialIcon } from '../MaterialIcon';
import { AppModal } from './AppModal';
import './PowerDialog.css';

type PowerAction = (label: string, args: string[], exitHint?: string) => void;

export function PowerDialog({ open, busy, onClose, onAction }: { open: boolean; busy: boolean; onClose: () => void; onAction: PowerAction }) {
  return <AppModal open={open} onClose={onClose} width="compact" title="Opciones de energía" actions={<md-text-button disabled={busy} onClick={onClose}>Cerrar</md-text-button>}>
    <div className="power-dialog__actions">
      <md-tonal-button disabled={busy} onClick={() => onAction('apagar pantalla', ['shell', 'input', 'keyevent', 'KEYCODE_SLEEP'])}><MaterialIcon name="screen_lock_portrait" /> Apagar pantalla</md-tonal-button>
      <md-tonal-button disabled={busy} onClick={() => onAction('reiniciar Android', ['reboot'])}><MaterialIcon name="restart_alt" /> Reiniciar</md-tonal-button>
      <md-tonal-button disabled={busy} onClick={() => onAction('apagar dispositivo', ['shell', 'reboot', '-p'])}><MaterialIcon name="power_settings_new" /> Apagar</md-tonal-button>
      <md-divider />
      <md-outlined-button disabled={busy} onClick={() => onAction('Recovery', ['reboot', 'recovery'], 'Selecciona Reboot system now.')}>Recovery</md-outlined-button>
      <md-outlined-button disabled={busy} onClick={() => onAction('Bootloader', ['reboot', 'bootloader'], 'Ejecuta fastboot reboot o selecciona Start.')}>Bootloader</md-outlined-button>
      <md-outlined-button disabled={busy} onClick={() => onAction('Fastbootd', ['reboot', 'fastboot'], 'Ejecuta fastboot reboot.')}>Fastbootd</md-outlined-button>
      <md-outlined-button disabled={busy} onClick={() => onAction('modo descarga', ['reboot', 'download'], 'La forma de salir depende del fabricante.')}>Modo descarga</md-outlined-button>
    </div>
  </AppModal>;
}
