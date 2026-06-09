import { useState, useEffect } from 'react';
import { useI18n } from '../../locales';
import { AppModal } from './AppModal';

type PromptDialogProps = {
  open: boolean;
  title: string;
  initialValue?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function PromptDialog({
  open,
  title,
  initialValue = '',
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialValue);
  const finalConfirmText = confirmText || t('common.confirm');
  const finalCancelText = cancelText || t('common.cancel');

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [open, initialValue]);

  const handleConfirm = () => {
    onConfirm(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    }
  };

  return (
    <AppModal
      open={open}
      title={title}
      onClose={onCancel}
      width="compact"
      actions={
        <>
          <md-text-button onClick={onCancel}>{finalCancelText}</md-text-button>
          <md-filled-button onClick={handleConfirm}>
            {finalConfirmText}
          </md-filled-button>
        </>
      }
    >
      <div style={{ marginTop: '8px' }}>
        <md-outlined-text-field
          style={{ width: '100%' }}
          value={value}
          onInput={(e: any) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </AppModal>
  );
}
