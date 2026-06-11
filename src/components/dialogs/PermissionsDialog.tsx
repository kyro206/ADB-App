import { useState, useEffect } from 'react';
import { useI18n } from '../../locales';
import { AppModal } from './AppModal';
import './PermissionsDialog.css';

type PermissionsDialogProps = {
  open: boolean;
  title: string;
  initialMode?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export function PermissionsDialog({
  open,
  title,
  initialMode = '755',
  onConfirm,
  onCancel,
}: PermissionsDialogProps) {
  const { t } = useI18n();
  const [octal, setOctal] = useState(initialMode);

  useEffect(() => {
    if (open) {
      const match = initialMode.match(/([0-7]{3})$/);
      setOctal(match ? match[1] : '755');
    }
  }, [open, initialMode]);

  const parseOctal = (o: string) => {
    const num = parseInt(o || '0', 8);
    if (isNaN(num)) return [0, 0, 0];
    return [
      (num >> 6) & 7,
      (num >> 3) & 7,
      num & 7
    ];
  };

  const perms = parseOctal(octal);

  const toggleBit = (groupIndex: number, bit: number) => {
    const newPerms = [...perms];
    newPerms[groupIndex] ^= bit;
    const newOctal = newPerms.map(p => p.toString(8)).join('');
    setOctal(newOctal);
  };

  const handleOctalInput = (e: any) => {
    let val = e.target.value.replace(/[^0-7]/g, '').slice(0, 3);
    setOctal(val);
  };

  const handleConfirm = () => {
    let finalOctal = octal;
    while (finalOctal.length < 3) finalOctal += '0';
    onConfirm(finalOctal);
  };

  const hasBit = (p: number, bit: number) => (p & bit) === bit;

  return (
    <AppModal
      open={open}
      title={title}
      onClose={onCancel}
      width="compact"
      actions={
        <>
          <md-text-button onClick={onCancel}>{t('common.cancel')}</md-text-button>
          <md-filled-button onClick={handleConfirm}>{t('common.confirm')}</md-filled-button>
        </>
      }
    >
      <div className="permissions-dialog-content">
        <div className="permissions-grid">
          <div></div>
          <div className="header">{t('files.permissions.read')}</div>
          <div className="header">{t('files.permissions.write')}</div>
          <div className="header">{t('files.permissions.execute')}</div>

          <div className="row-label">{t('files.permissions.owner')}</div>
          <md-checkbox checked={hasBit(perms[0], 4) || undefined} onInput={() => toggleBit(0, 4)}></md-checkbox>
          <md-checkbox checked={hasBit(perms[0], 2) || undefined} onInput={() => toggleBit(0, 2)}></md-checkbox>
          <md-checkbox checked={hasBit(perms[0], 1) || undefined} onInput={() => toggleBit(0, 1)}></md-checkbox>

          <div className="row-label">{t('files.permissions.group')}</div>
          <md-checkbox checked={hasBit(perms[1], 4) || undefined} onInput={() => toggleBit(1, 4)}></md-checkbox>
          <md-checkbox checked={hasBit(perms[1], 2) || undefined} onInput={() => toggleBit(1, 2)}></md-checkbox>
          <md-checkbox checked={hasBit(perms[1], 1) || undefined} onInput={() => toggleBit(1, 1)}></md-checkbox>

          <div className="row-label">{t('files.permissions.others')}</div>
          <md-checkbox checked={hasBit(perms[2], 4) || undefined} onInput={() => toggleBit(2, 4)}></md-checkbox>
          <md-checkbox checked={hasBit(perms[2], 2) || undefined} onInput={() => toggleBit(2, 2)}></md-checkbox>
          <md-checkbox checked={hasBit(perms[2], 1) || undefined} onInput={() => toggleBit(2, 1)}></md-checkbox>
        </div>
        
        <div className="permissions-octal">
          <span>{t('files.permissions.octal')}</span>
          <md-outlined-text-field 
            value={octal} 
            onInput={handleOctalInput} 
          />
        </div>
      </div>
    </AppModal>
  );
}
