import { type ReactNode } from 'react';
import { useI18n } from '../../locales';
import { AppModal } from './AppModal';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string | ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const finalConfirmText = confirmText || t('common.confirm');
  const finalCancelText = cancelText || t('common.cancel');

  return (
    <AppModal
      open={open}
      title={title}
      onClose={onCancel}
      width="compact"
      actions={
        <>
          <md-text-button onClick={onCancel}>{finalCancelText}</md-text-button>
          <md-filled-button 
            onClick={onConfirm} 
            className={isDanger ? 'md-btn-danger' : ''}
          >
            {finalConfirmText}
          </md-filled-button>
        </>
      }
    >
      <p style={{ margin: 0, color: 'var(--on-surface-variant)', lineHeight: '1.5' }}>
        {message}
      </p>
    </AppModal>
  );
}