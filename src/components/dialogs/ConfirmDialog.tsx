import { type ReactNode } from 'react';
import { AppModal } from './AppModal'; // Ajusta la ruta si es necesario

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
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AppModal
      open={open}
      title={title}
      onClose={onCancel}
      width="compact"
      actions={
        <>
          <md-text-button onClick={onCancel}>{cancelText}</md-text-button>
          <md-filled-button 
            onClick={onConfirm} 
            className={isDanger ? 'md-btn-danger' : ''}
          >
            {confirmText}
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