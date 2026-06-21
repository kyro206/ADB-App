<script lang="ts">
import * as m from '../../paraglide/messages';

  import { invoke } from '@tauri-apps/api/core';
  import { devicesState } from '../../context/devices.svelte';
  
  import MaterialIcon from '../MaterialIcon.svelte';
  import AppModal from './AppModal.svelte';
  import { materialTextFieldValue } from '../../actions/materialTextFieldValue';
  let { open = false, onClose } = $props<{ open: boolean; onClose: () => void }>();

  type WirelessMode = 'manual' | 'qr';
  type WirelessQrPayload = { service_name: string; password: string; qr_data_url: string };

  let mode = $state<WirelessMode>('manual');
  let busy = $state(false);
  let errorText = $state('');
  let successText = $state('');
  let endpoint = $state('');
  let endpointError = $state(false);
  let code = $state('');
  let qrPayload = $state<WirelessQrPayload | null>(null);

  let isPairing = $derived(code.trim().length > 0);
  let genId = 0;

  function handleClose() {
    genId++; // Cancels ongoing operations
    busy = false;
    errorText = '';
    successText = '';
    endpointError = false;
    onClose();
  }

  function resetState(newMode: WirelessMode) {
    mode = newMode;
    errorText = '';
    successText = '';
    endpointError = false;
    genId++;
    busy = false;
  }

  async function run(command: string, payload: Record<string, unknown>) {
    genId++;
    const currentGen = genId;
    busy = true;
    errorText = '';
    successText = '';
    endpointError = false;
    try { 
      const oldDevices = await invoke<any[]>('list_devices').catch(() => []);
      await invoke<string>(command, payload); 
      if (currentGen !== genId) return;
      
      const newDevices = await invoke<any[]>('list_devices').catch(() => []);
      const newDevice = newDevices.find(nd => !oldDevices.some(od => od.serial === nd.serial));
      await devicesState.refreshDevices(newDevice?.serial);
      
      handleClose(); // Cierra el diálogo cuando termina con éxito
    }
    catch (error) { 
      if (currentGen === genId) {
        errorText = String(error); 
        busy = false; 
      }
    }
  }

  function submitManual() {
    errorText = '';
    successText = '';
    endpointError = false;
    
    if (!endpoint.trim().includes(':')) {
      endpointError = true;
      return;
    }
    
    if (isPairing) {
      run('pair_wireless_device', { endpoint, code });
    } else {
      run('connect_wireless_device', { endpoint });
    }
  }

  async function generateQr() {
    genId++;
    const currentGen = genId;
    busy = true;
    errorText = '';
    successText = '';
    let payload: WirelessQrPayload | null = null;
    try { 
      payload = await invoke<WirelessQrPayload>('generate_wireless_qr');
      if (mode === 'qr' && open && currentGen === genId) {
        qrPayload = payload; 
      }
    }
    catch (error) { 
      if (mode === 'qr' && open && currentGen === genId) {
        errorText = String(error); 
        busy = false; 
      }
      return; 
    }
    
    if (payload && mode === 'qr' && open && currentGen === genId) {
      try {
        const oldDevices = await invoke<any[]>('list_devices').catch(() => []);
        await invoke<string>('pair_wireless_qr', { serviceName: payload.service_name, password: payload.password });
        if (currentGen !== genId) return;

        const newDevices = await invoke<any[]>('list_devices').catch(() => []);
        const newDevice = newDevices.find(nd => !oldDevices.some(od => od.serial === nd.serial));
        await devicesState.refreshDevices(newDevice?.serial);
        
        if (open && currentGen === genId) {
          handleClose();
        }
      } catch (error) {
        if (mode === 'qr' && open && currentGen === genId) {
          generateQr();
        }
      }
    }
  }

  $effect(() => {
    if (mode === 'qr' && !qrPayload && !busy) {
      generateQr();
    }
  });
</script>

<AppModal {open} onClose={handleClose} title={m.wireless_title()}>
  {#snippet actions()}
    {#if mode === 'manual'}
      <md-filled-button 
        disabled={!endpoint.trim() || busy ? true : undefined} 
        onclick={submitManual}
      >
        {isPairing ? m.wireless_action_pair() : m.wireless_action_connect()}
      </md-filled-button>
    {/if}
  {/snippet}
  <md-tabs class="wireless-tabs">
    <md-primary-tab active={mode === 'manual' ? true : undefined} onclick={() => resetState('manual')}>
      {m.wireless_tab_manual()}
    </md-primary-tab>
    <md-primary-tab active={mode === 'qr' ? true : undefined} onclick={() => {
      if (mode === 'qr') generateQr();
      else resetState('qr');
    }}>
      {m.wireless_tab_qr()}
    </md-primary-tab>
  </md-tabs>
  
  {#if mode === 'manual'}
    <section class="wireless-form">
      {#if busy}
        <div class="wireless-loading">
          <md-circular-progress indeterminate></md-circular-progress>
          <p>{isPairing ? m.wireless_pair_pending() : m.wireless_connect_pending()}</p>
        </div>
      {:else}
        <p>{m.wireless_manual_desc()}</p>
        <md-outlined-text-field 
          label={m.wireless_manual_endpoint()} 
          use:materialTextFieldValue={endpoint}
          oninput={(e: any) => { endpoint = e.target.value; endpointError = false; errorText = ''; }} 
          error={endpointError || !!errorText ? true : undefined}
          error-text={endpointError ? m.wireless_manual_endpoint_error() : errorText}
        ></md-outlined-text-field>
        <md-outlined-text-field 
          label={m.wireless_manual_code()} 
          use:materialTextFieldValue={code}
          oninput={(e: any) => code = e.target.value} 
        ></md-outlined-text-field>
        {#if successText}
          <div class="wireless-success">
             <MaterialIcon name="check_circle" filled />
             <span>{successText}</span>
          </div>
        {/if}
      {/if}
    </section>
  {/if}
  
  {#if mode === 'qr'}
    <section class="wireless-qr">
      <div class="wireless-qr__preview">
        {#if !qrPayload && busy}
          <md-circular-progress indeterminate></md-circular-progress>
        {:else if qrPayload}
          <img src={qrPayload.qr_data_url} alt={m.wireless_qr_alt()} />
        {:else}
          <MaterialIcon name="qr_code_2" />
        {/if}
      </div>
      <div class="wireless-qr__info">
        <p>{m.wireless_qr_desc()}</p>
        {#if errorText}
          <div class="wireless-error">
             <MaterialIcon name="error" />
             <span>{errorText}</span>
          </div>
        {/if}
      </div>
    </section>
  {/if}
</AppModal>

<style>
:global {
.wireless-form{display:flex;flex-direction:column;gap:14px;padding-top:20px}.wireless-form p,.wireless-qr p{color:var(--on-surface-variant)}.wireless-form md-filled-button{align-self:flex-end}.wireless-qr{display:grid;grid-template-columns:220px 1fr;align-items:center;gap:20px;padding-top:20px}.wireless-qr__preview{display:grid;place-items:center;aspect-ratio:1;overflow:hidden;background:#fff;border-radius:var(--radius-lg)}.wireless-qr__preview img{width:100%;height:100%;object-fit:contain}.wireless-qr__preview :global(.material-symbols-rounded){color:#555;font-size:64px}.wireless-qr__info{display:flex;flex-direction:column;gap:8px}.wireless-qr__actions{display:flex;gap:8px;margin-top:16px}.wireless-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:32px 0;text-align:center;color:var(--on-surface)}.wireless-error{display:flex;align-items:center;gap:8px;color:var(--color-red, #d32f2f);margin-top:4px;font-size:14px}.wireless-error :global(.material-symbols-rounded){color:var(--color-red, #d32f2f)}.wireless-success{display:flex;align-items:center;gap:8px;color:var(--color-green, #4caf50);margin-top:4px;font-size:14px}.wireless-success :global(.material-symbols-rounded){color:var(--color-green, #4caf50)}@media(max-width:620px){.wireless-qr{grid-template-columns:1fr}.wireless-qr__preview{width:min(220px,100%);margin:auto}.wireless-qr__actions{flex-wrap:wrap}}md-tabs, md-primary-tab {--md-primary-tab-container-color: transparent;--md-sys-color-surface: transparent;background-color: transparent;}
}
</style>

