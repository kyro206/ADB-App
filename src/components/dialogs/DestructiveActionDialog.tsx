import { useI18n } from '../../locales';
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
  const { t } = useI18n();
  const uninstall = action === 'uninstall';
  const title = uninstall ? t('app.action.uninstallApp') : t('app.action.clearData');
  const description = uninstall
    ? t('app.desc.uninstall')
    : t('app.desc.clearData');

  return <AppModal
    open={Boolean(action)}
    onClose={onClose}
    width="compact"
    title={title}
    subtitle={t('common.cannotUndo')}
    actions={<>
      <md-text-button disabled={busy || undefined} onClick={onClose}>{t('common.cancel')}</md-text-button>
      <md-filled-button className="destructive-dialog__confirm" disabled={busy || undefined} onClick={onConfirm}>{busy ? t('common.processing') : uninstall ? t('common.uninstall') : t('common.clearData')}</md-filled-button>
    </>}
  >
    <div className="destructive-dialog">
      <span className="destructive-dialog__icon">{iconDataUrl ? <img src={iconDataUrl} alt="" /> : <MaterialIcon name={uninstall ? 'delete_forever' : 'delete_sweep'} />}</span>
      <div><strong>{appName}</strong><p className="destructive-dialog__package">{packageName}</p><p>{description}</p></div>
    </div>
  </AppModal>;
}
