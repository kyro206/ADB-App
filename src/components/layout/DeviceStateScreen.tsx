import type { ReactNode } from 'react';
import { useI18n } from '../../locales';
import { MaterialIcon } from '../MaterialIcon';
import './DeviceStateScreen.css';

export type DeviceStateScreenProps = {
  serial: string | null;
  loading?: boolean;
  children: ReactNode;
};

export function DeviceStateScreen({ serial, loading, children }: DeviceStateScreenProps) {
  const { t } = useI18n();

  if (!serial) {
    return (
      <div className="device-state-screen empty">
        <MaterialIcon name="phonelink_off" size={48} className="device-state-icon" />
        <h2>{t('common.device.empty.title')}</h2>
        <p>{t('common.device.empty.desc')}</p>
      </div>
    );
  }

  return (
    <>
      {loading && (
        <div className="device-state-screen loading">
          <md-circular-progress indeterminate></md-circular-progress>
        </div>
      )}
      <div style={{ display: loading ? 'none' : 'contents' }}>
        {children}
      </div>
    </>
  );
}
