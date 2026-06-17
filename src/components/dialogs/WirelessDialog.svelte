<script lang="ts">
import * as m from '../../paraglide/messages';

  import { invoke } from '@tauri-apps/api/core';
  import { devicesState } from '../../context/devices.svelte';
  
  import MaterialIcon from '../MaterialIcon.svelte';
  import AppModal from './AppModal.svelte';
  let { open = false, onClose } = $props<{ open: boolean; onClose: () => void }>();

  type WirelessMode = 'connect' | 'pair' | 'qr';
  type WirelessQrPayload = { service_name: string; password: string; qr_data_url: string };

  let mode = $state<WirelessMode>('connect');
  let busy = $state(false);
  let status = $state('');
  let connectEndpoint = $state('');
  let pairEndpoint = $state('');
  let pairCode = $state('');
  let qrPayload = $state<WirelessQrPayload | null>(null);

  let genId = 0;

  async function run(command: string, payload: Record<string, unknown>, pending: string, success: string) {
    busy = true;
    status = pending;
    try { 
      const oldDevices = await invoke<any[]>('list_devices').catch(() => []);
      status = await invoke<string>(command, payload) || success; 
      const newDevices = await invoke<any[]>('list_devices').catch(() => []);
      
      const newDevice = newDevices.find(nd => !oldDevices.some(od => od.serial === nd.serial));
      await devicesState.refreshDevices(newDevice?.serial);
      
      onClose();
    }
    catch (error) { status = String(error); }
    finally { busy = false; }
  }

  async function generateQr() {
    genId++;
    const currentGen = genId;
    busy = true;
    status = m.wireless_status_generatingQr();
    let payload: WirelessQrPayload | null = null;
    try { 
      payload = await invoke<WirelessQrPayload>('generate_wireless_qr');
      if (mode === 'qr' && open && currentGen === genId) {
        qrPayload = payload; 
      }
    }
    catch (error) { 
      if (mode === 'qr' && open && currentGen === genId) {
        status = String(error); 
        busy = false; 
      }
      return; 
    }
    
    if (payload && mode === 'qr' && open && currentGen === genId) {
      status = m.wireless_status_scanQr();
      try {
        const oldDevices = await invoke<any[]>('list_devices').catch(() => []);
        await invoke<string>('pair_wireless_qr', { serviceName: payload.service_name, password: payload.password });
        const newDevices = await invoke<any[]>('list_devices').catch(() => []);
        
        const newDevice = newDevices.find(nd => !oldDevices.some(od => od.serial === nd.serial));
        await devicesState.refreshDevices(newDevice?.serial);
        
        if (open && currentGen === genId) {
          onClose();
        }
      } catch (error) {
        if (mode === 'qr' && open && currentGen === genId) {
          generateQr();
        }
      }
    }
  }

  $effect(() => {
    if (open && status === '') status = m.wireless_status_ready();
    if (mode === 'qr' && !qrPayload && !busy) {
      generateQr();
    }
  });
</script>

<AppModal {open} {onClose} title={m.wireless_title()}>
  <md-tabs class="wireless-tabs">
    <md-primary-tab active={mode === 'connect' ? true : undefined} onclick={() => mode = 'connect'}>
      {m.wireless_tab_connect()}
    </md-primary-tab>
    <md-primary-tab active={mode === 'pair' ? true : undefined} onclick={() => mode = 'pair'}>
      {m.wireless_tab_code()}
    </md-primary-tab>
    <md-primary-tab active={mode === 'qr' ? true : undefined} onclick={() => {
      if (mode === 'qr') generateQr();
      else mode = 'qr';
    }}>
      {m.wireless_tab_qr()}
    </md-primary-tab>
  </md-tabs>
  
  {#if mode === 'connect'}
    <section class="wireless-form">
      <p>{m.wireless_connect_desc()}</p>
      <md-outlined-text-field 
        label={m.wireless_connect_endpoint()} 
        value={connectEndpoint} 
        oninput={(e: any) => connectEndpoint = e.target.value} 
      ></md-outlined-text-field>
      <md-filled-button 
        disabled={!connectEndpoint.trim() || busy ? true : undefined} 
        onclick={() => run('connect_wireless_device', { endpoint: connectEndpoint }, m.wireless_connect_pending(), m.wireless_connect_success())}
      >
        {m.wireless_tab_connect()}
      </md-filled-button>
    </section>
  {/if}
  
  {#if mode === 'pair'}
    <section class="wireless-form">
      <p>{m.wireless_pair_desc()}</p>
      <md-outlined-text-field 
        label={m.wireless_pair_endpoint()} 
        value={pairEndpoint} 
        oninput={(e: any) => pairEndpoint = e.target.value} 
      ></md-outlined-text-field>
      <md-outlined-text-field 
        label={m.wireless_pair_code()} 
        value={pairCode} 
        oninput={(e: any) => pairCode = e.target.value} 
      ></md-outlined-text-field>
      <md-filled-button 
        disabled={!pairEndpoint.trim() || !pairCode.trim() || busy ? true : undefined} 
        onclick={() => run('pair_wireless_device', { endpoint: pairEndpoint, code: pairCode }, m.wireless_pair_pending(), m.wireless_pair_success())}
      >
        {m.wireless_action_pair()}
      </md-filled-button>
    </section>
  {/if}
  
  {#if mode === 'qr'}
    <section class="wireless-qr">
      <div class="wireless-qr__preview">
        {#if qrPayload}
          <img src={qrPayload.qr_data_url} alt={m.wireless_qr_alt()} />
        {:else}
          <MaterialIcon name="qr_code_2" />
        {/if}
      </div>
      <div>
        <p>{m.wireless_qr_desc()}</p>
      </div>
    </section>
  {/if}
  
  <div class="wireless-status">
    {#if busy}
      <md-circular-progress indeterminate></md-circular-progress>
    {:else}
      <MaterialIcon name="check_circle" filled />
    {/if}
    <span>{status}</span>
  </div>
</AppModal>

<style>
:global {
.wireless-form{display:flex;flex-direction:column;gap:14px;padding-top:20px}.wireless-form p,.wireless-qr p,.wireless-status{color:var(--on-surface-variant)}.wireless-form md-filled-button{align-self:flex-end}.wireless-qr{display:grid;grid-template-columns:220px 1fr;align-items:center;gap:20px;padding-top:20px}.wireless-qr__preview{display:grid;place-items:center;aspect-ratio:1;overflow:hidden;background:#fff;border-radius:var(--radius-lg)}.wireless-qr__preview img{width:100%;height:100%;object-fit:contain}.wireless-qr__preview :global(.material-symbols-rounded){color:#555;font-size:64px}.wireless-qr__actions{display:flex;gap:8px;margin-top:16px}.wireless-status{display:flex;align-items:center;gap:10px;margin-top:20px}.wireless-status md-circular-progress{width:24px;height:24px}.wireless-status :global(.material-symbols-rounded){color:var(--color-green)}@media(max-width:620px){.wireless-qr{grid-template-columns:1fr}.wireless-qr__preview{width:min(220px,100%);margin:auto}.wireless-qr__actions{flex-wrap:wrap}}md-tabs, md-primary-tab {--md-primary-tab-container-color: transparent;--md-sys-color-surface: transparent;background-color: transparent;}
}
</style>
