import { MaterialIcon } from '../MaterialIcon';
import { AppModal } from './AppModal';
import './DestructiveActionDialog.css';

export type DestructiveAppAction = 'uninstall' | 'clear-data';

export function DestructiveActionDialog({ action, appName, packageName, iconDataUrl, busy, onClose, onConfirm }: {
  action: DestructiveAppAction | null;
  appName: string;
  packageName: string;
  iconDataUrl: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const uninstall = action === 'uninstall';
  const title = uninstall ? 'Desinstalar aplicación' : 'Borrar datos de la aplicación';
  const description = uninstall
    ? 'La aplicación y todos sus datos se eliminarán del dispositivo.'
    : 'Se eliminarán los datos, ajustes, cuentas y archivos internos de la aplicación. La aplicación permanecerá instalada.';

  return <AppModal
    open={Boolean(action)}
    onClose={onClose}
    width="compact"
    title={title}
    subtitle="Esta acción no se puede deshacer."
    actions={<>
      <md-text-button disabled={busy || undefined} onClick={onClose}>Cancelar</md-text-button>
      <md-filled-button className="destructive-dialog__confirm" disabled={busy || undefined} onClick={onConfirm}>{busy ? 'Procesando…' : uninstall ? 'Desinstalar' : 'Borrar datos'}</md-filled-button>
    </>}
  >
    <div className="destructive-dialog">
      <span className="destructive-dialog__icon">{iconDataUrl ? <img src={iconDataUrl} alt="" /> : <MaterialIcon name={uninstall ? 'delete_forever' : 'delete_sweep'} />}</span>
      <div><strong>{appName}</strong><code>{packageName}</code><p>{description}</p></div>
    </div>
  </AppModal>;
}
