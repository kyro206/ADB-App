import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../locales';
import type { Device } from '../../context/DeviceContext';
import { MaterialIcon } from '../MaterialIcon';

interface DeviceSelectorProps {
  devices: Device[];
  selectedDevice: Device | null;
  loading: boolean;
  loadingLabel: string;
  emptyLabel: string;
  onSelect: (serial: string) => void;
  onDisconnect?: (serial: string) => void;
}

export function DeviceSelector({ devices, selectedDevice, loading, loadingLabel, emptyLabel, onSelect, onDisconnect }: DeviceSelectorProps) {
  const { t } = useI18n();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<any>(null);
  const onSelectRef = useRef(onSelect);
  const [open, setOpen] = useState(false);
  const disabled = loading || devices.length === 0;
  const label = selectedDevice?.model || selectedDevice?.serial || (loading ? loadingLabel : emptyLabel);
  const connectionIcon = selectedDevice && (selectedDevice.serial.includes(':') || selectedDevice.serial.includes('._tcp')) ? 'wifi' : 'smartphone';

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const menu = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor) return;
    menu.anchorElement = anchor;
    const opening = () => setOpen(true);
    const closed = () => setOpen(false);
    const selected = (event: Event) => {
      const detail = (event as CustomEvent<{ initiator?: HTMLElement }>).detail;
      const serial = detail?.initiator?.dataset.deviceSerial;
      if (serial) void onSelectRef.current(serial);
    };
    menu.addEventListener('opening', opening);
    menu.addEventListener('closed', closed);
    menu.addEventListener('close-menu', selected);
    return () => {
      menu.removeEventListener('opening', opening);
      menu.removeEventListener('closed', closed);
      menu.removeEventListener('close-menu', selected);
    };
  }, []);

  const toggleMenu = () => {
    if (disabled) return;
    const menu = menuRef.current;
    const anchor = anchorRef.current;
    if (!menu || !anchor) return;
    menu.anchorElement = anchor;
    const width = `${anchor.getBoundingClientRect().width}px`;
    menu.style.setProperty('--md-menu-container-width', width);
    menu.style.setProperty('max-width', width);
    menu.style.setProperty('min-width', width);
    menu.style.width = width;
    if (menu.open) menu.close();
    else menu.show();
  };

  return <div className="topbar-device-picker">
    <button
      ref={anchorRef}
      className={`topbar-device-picker__field ${open ? 'open' : ''}`}
      type="button"
      aria-label={t('device.selector.label')}
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={disabled}
      onClick={toggleMenu}
      onDoubleClick={event => event.stopPropagation()}
    >
      <MaterialIcon name={selectedDevice ? connectionIcon : 'devices'} />
      <span className="topbar-device-picker__label">{label}</span>
      {selectedDevice && <span className={`topbar-device-picker__status ${selectedDevice.state === 'device' ? 'connected' : ''}`} aria-label={selectedDevice.state} />}
      <MaterialIcon name="arrow_drop_down" className="topbar-device-picker__arrow" />
      <md-ripple />
    </button>
    <md-menu
      ref={menuRef}
      className="topbar-device-picker__menu"
      positioning="popover"
      anchorCorner="end-start"
      menuCorner="start-start"
    >
      {devices.map(device => {
        const isWireless = device.serial.includes(':') || device.serial.includes('._tcp');
        return <md-menu-item
          key={device.serial}
          className="topbar-device-picker__option"
          data-device-serial={device.serial}
          selected={selectedDevice?.serial === device.serial || undefined}
          typeaheadText={`${device.model} ${device.serial}`}
        >
          <MaterialIcon slot="start" name={isWireless ? 'wifi' : 'smartphone'} />
          <div slot="headline">{device.model || device.serial}</div>
          <div slot="supporting-text">{device.serial} · {device.state}</div>
          {isWireless ? (
            <md-icon-button
              slot="end"
              onPointerDown={(e: React.PointerEvent) => {
                e.stopPropagation();
                e.preventDefault();
                if (onDisconnect) onDisconnect(device.serial);
              }}
              title={t('topbar.wireless.disconnect')}
            >
              <MaterialIcon name="close" />
            </md-icon-button>
          ) : (
            selectedDevice?.serial === device.serial && <MaterialIcon slot="end" name="check" />
          )}
        </md-menu-item>;
      })}
    </md-menu>
  </div>;
}
