import { useI18n } from '../../locales';
import { MaterialIcon } from '../MaterialIcon';
import './TransferMenu.css';

export type TransferStatus = 'idle' | 'transferring' | 'success' | 'error';
export type TransferType = 'upload' | 'download';

export interface TransferJob {
  id: string;
  type: TransferType;
  name: string;
  source: string;
  destination: string;
  isDirectory: boolean;
  status: TransferStatus;
  error?: string;
  children?: TransferJob[];
}

interface TransferMenuProps {
  open: boolean;
  jobs: TransferJob[];
  onClose: () => void;
  onClear: () => void;
  onRetry: (id: string, parentId?: string) => void;
}

function StatusIcon({ status }: { status: TransferStatus }) {
  if (status === 'idle') return <MaterialIcon name="schedule" className="transfer-status-icon idle" />;
  if (status === 'transferring') return <md-circular-progress indeterminate style={{ '--md-circular-progress-size': '32px' }}></md-circular-progress>;
  if (status === 'success') return <MaterialIcon name="check_circle" className="transfer-status-icon success" />;
  if (status === 'error') return <MaterialIcon name="error" className="transfer-status-icon error" />;
  return null;
}

export function TransferMenu({ open, jobs, onClose, onClear, onRetry }: TransferMenuProps) {
  const { t } = useI18n();

  return (
    <div className={`transfer-menu-overlay ${open ? 'open' : ''}`} onClick={onClose}>
      <aside className="transfer-menu" onClick={e => e.stopPropagation()}>
        <header className="transfer-menu__header">
          <h3>
            <MaterialIcon name="swap_vert" />
            {t('transfers.title')}
          </h3>
          <div className="transfer-menu__actions">
            <md-icon-button title={t('transfers.clear')} onClick={onClear}>
              <MaterialIcon name="clear_all" />
            </md-icon-button>
            <md-icon-button onClick={onClose}>
              <MaterialIcon name="close" />
            </md-icon-button>
          </div>
        </header>
        
        <div className="transfer-menu__content">
          {jobs.length === 0 ? (
            <div className="transfer-menu__empty">
              <MaterialIcon name="done_all" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.5 }} />
              <p>{t('transfers.empty')}</p>
            </div>
          ) : (
            <ul className="transfer-list">
              {jobs.map(job => (
                <li key={job.id} className="transfer-item-container">
                  <div className={`transfer-item ${job.status}`}>
                    <div className="transfer-item__icon">
                      <MaterialIcon name={job.isDirectory ? 'folder' : (job.type === 'upload' ? 'upload_file' : 'download')} />
                    </div>
                    <div className="transfer-item__details">
                      <span className="transfer-item__name">{job.name}</span>
                      <span className="transfer-item__status-text">
                        {job.status === 'error' && job.error ? job.error : t(`transfers.${job.status}`)}
                      </span>
                    </div>
                    <div className="transfer-item__trailing">
                      {job.status === 'error' && (
                        <md-icon-button onClick={() => onRetry(job.id)} title={t('transfers.retry')}>
                          <MaterialIcon name="refresh" />
                        </md-icon-button>
                      )}
                      <StatusIcon status={job.status} />
                    </div>
                  </div>
                  
                  {job.children && job.children.length > 0 && (
                    <ul className="transfer-sublist">
                      {job.children.map(child => (
                        <li key={child.id} className={`transfer-subitem ${child.status}`}>
                          <MaterialIcon name={child.isDirectory ? 'folder' : 'draft'} />
                          <div className="transfer-subitem__details">
                            <span className="transfer-subitem__name">{child.name}</span>
                            {child.status === 'error' && child.error && (
                              <span className="transfer-item__status-text" style={{ color: 'var(--md-sys-color-error)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                                {child.error}
                              </span>
                            )}
                          </div>
                          <div className="transfer-subitem__trailing">
                            {child.status === 'error' && (
                              <md-icon-button onClick={() => onRetry(child.id, job.id)} title={t('transfers.retry')}>
                                <MaterialIcon name="refresh" />
                              </md-icon-button>
                            )}
                            <StatusIcon status={child.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
