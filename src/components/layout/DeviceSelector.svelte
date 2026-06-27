<script lang="ts">
import * as m from '../../paraglide/messages';

  import { onMount } from 'svelte';
  
  import type { Device, DeviceDetails } from '../../context/devices.svelte';
  import MaterialIcon from '../MaterialIcon.svelte';
  import { getMarketingName } from '../../pages/workbench/utils';

  function formatLabel(marketingName: string, model: string) {
    return marketingName ? `${marketingName} (${model})` : model;
  }

  function getShortDeviceName(device: Device | null) {
    if (!device) return null;
    if (device.model) {
      let marketingName = getMarketingName(device.model);
      if (!marketingName) {
         const cleanModel = device.model.replace(/_/g, '-').toUpperCase();
         marketingName = getMarketingName(cleanModel);
      }
      return marketingName || device.model;
    }
    return device.serial;
  }

  function getDeviceName(device: Device | null) {
    if (!device) return null;
    if (device.model) {
      let marketingName = getMarketingName(device.model);
      if (!marketingName) {
         const cleanModel = device.model.replace(/_/g, '-').toUpperCase();
         marketingName = getMarketingName(cleanModel);
      }
      return formatLabel(marketingName, device.model);
    }
    return device.serial;
  }

  let {
    devices,
    selectedDevice,
    deviceDetails = null,
    loading,
    loadingLabel,
    emptyLabel,
    onSelect,
    onDisconnect
  } = $props<{
    devices: Device[];
    selectedDevice: Device | null;
    deviceDetails?: DeviceDetails | null;
    loading: boolean;
    loadingLabel: string;
    emptyLabel: string;
    onSelect: (serial: string) => void;
    onDisconnect?: (serial: string) => void;
  }>();

  let anchorElement: HTMLButtonElement | undefined = $state();
  let menuElement: any | undefined = $state();
  let open = $state(false);

  let disabled = $derived(loading || devices.length === 0);
  let label = $derived(
    (deviceDetails 
      ? (getMarketingName(deviceDetails.model, deviceDetails.brand) || deviceDetails.model)
      : getShortDeviceName(selectedDevice))
    || (loading ? loadingLabel : emptyLabel)
  );
  let connectionIcon = $derived(selectedDevice && (selectedDevice.serial.includes(':') || selectedDevice.serial.includes('._tcp')) ? 'wifi' : 'smartphone');

  onMount(() => {
    if (!menuElement || !anchorElement) return;
    
    menuElement.anchorElement = anchorElement;
    
    const opening = () => open = true;
    const closed = () => open = false;
    const selected = (event: Event) => {
      const detail = (event as CustomEvent<{ initiator?: HTMLElement }>).detail;
      const serial = detail?.initiator?.dataset.deviceSerial;
      if (serial) onSelect(serial);
    };
    
    menuElement.addEventListener('opening', opening);
    menuElement.addEventListener('closed', closed);
    menuElement.addEventListener('close-menu', selected);
    
    return () => {
      menuElement.removeEventListener('opening', opening);
      menuElement.removeEventListener('closed', closed);
      menuElement.removeEventListener('close-menu', selected);
    };
  });

  async function toggleMenu() {
    if (disabled) return;
    if (!menuElement || !anchorElement) return;
    
    menuElement.anchorElement = anchorElement;
    const width = `${anchorElement.getBoundingClientRect().width}px`;
    menuElement.style.setProperty('--md-menu-container-width', width);
    menuElement.style.setProperty('max-width', width);
    menuElement.style.setProperty('min-width', width);
    menuElement.style.width = width;
    
    if (menuElement.open) {
      menuElement.close();
    } else {
      menuElement.show();
    }
  }

  function handleDisconnect(e: Event, serial: string) {
    e.stopPropagation();
    e.preventDefault();
    if (onDisconnect) onDisconnect(serial);
  }
</script>

<div class="topbar-device-picker">
  <button
    bind:this={anchorElement}
    class="topbar-device-picker__field {open ? 'open' : ''}"
    type="button"
    aria-label={m.device_selector_label()}
    aria-haspopup="menu"
    aria-expanded={open}
    {disabled}
    onclick={toggleMenu}
    ondblclick={e => e.stopPropagation()}
  >
    <MaterialIcon name={selectedDevice ? connectionIcon : 'devices'} />
    <span class="topbar-device-picker__label">{label}</span>
    {#if selectedDevice}
      <span class="topbar-device-picker__status {selectedDevice.state === 'device' ? 'connected' : ''}" aria-label={selectedDevice.state}></span>
    {/if}
    <MaterialIcon name="arrow_drop_down" class="topbar-device-picker__arrow" />
    <md-ripple></md-ripple>
  </button>
  
  <md-menu
    bind:this={menuElement}
    class="topbar-device-picker__menu"
    positioning="popover"
    anchorCorner="end-start"
    menuCorner="start-start"
  >
    {#each devices as device}
      {@const isWireless = device.serial.includes(':') || device.serial.includes('._tcp')}
      {@const deviceName = getDeviceName(device)}
      <md-menu-item
        class="topbar-device-picker__option"
        data-device-serial={device.serial}
        selected={selectedDevice?.serial === device.serial ? true : undefined}
        typeaheadText={`${deviceName} ${device.serial}`}
      >
        <MaterialIcon slot="start" name={isWireless ? 'wifi' : 'smartphone'} />
        <div slot="headline">{deviceName}</div>
        <div slot="supporting-text">{device.serial} · {device.state}</div>
        
        {#if isWireless}
          <md-icon-button
            slot="end"
            onpointerdown={(e: PointerEvent) => handleDisconnect(e, device.serial)}
            onkeydown={(e: KeyboardEvent) => {handleDisconnect(e, device.serial)}}
            title={m.topbar_wireless_disconnect()}
          >
            <MaterialIcon name="close" />
          </md-icon-button>
        {:else if selectedDevice?.serial === device.serial}
          <MaterialIcon slot="end" name="check" />
        {/if}
      </md-menu-item>
    {/each}
  </md-menu>
</div>
