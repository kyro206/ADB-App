<script lang="ts" module>
import * as m from '../../paraglide/messages';

  export type PowerAction = (label: string, args: string[], exitHint?: string) => void;
</script>

<script lang="ts">
  
  import MaterialIcon from '../MaterialIcon.svelte';
  import AppModal from './AppModal.svelte';
  let {
    open = false,
    busy = false,
    onClose,
    onAction
  } = $props<{
    open: boolean;
    busy: boolean;
    onClose: () => void;
    onAction: PowerAction;
  }>();

  let confirmStep = $state<{ label: string, icon: string, args: string[], exitHint?: string, danger?: boolean } | null>(null);

  function requestAction(label: string, icon: string, args: string[], exitHint?: string, danger?: boolean) {
    if (label === m.power_btn_screenOff()) {
      onAction(label, args, exitHint);
    } else {
      confirmStep = { label, icon, args, exitHint, danger };
    }
  }

  function handleClose() {
    if (confirmStep) {
      confirmStep = null;
    } else {
      onClose();
    }
  }

  function executeAction() {
    if (confirmStep) {
      onAction(confirmStep.label, confirmStep.args, confirmStep.exitHint);
      confirmStep = null;
    }
  }
</script>

<AppModal 
  {open} 
  onClose={handleClose} 
  width="compact" 
  title={confirmStep ? m.home_power_confirm_title() : m.power_title()} 
  subtitle={confirmStep ? '' : m.power_subtitle()}
>
  {#if confirmStep}
    <div class="power-dialog__confirm">
      <MaterialIcon name={confirmStep.icon} class="power-dialog__confirm-icon" />
      <p><strong>{confirmStep.label}</strong></p>
      {#if confirmStep.exitHint}
        <p class="power-dialog__hint">
          <MaterialIcon name="info" />
          <span>{m.home_power_confirm_exit()} {confirmStep.exitHint}</span>
        </p>
      {/if}
      <div class="power-dialog__confirm-actions">
        <md-text-button onclick={() => confirmStep = null}>{m.common_cancel()}</md-text-button>
        <md-filled-button class={confirmStep.danger ? 'md-btn-danger' : ''} onclick={executeAction}>
          {m.common_continue()}
        </md-filled-button>
      </div>
    </div>
  {:else}
    <div class="power-dialog__actions">
      <md-filled-tonal-button disabled={busy ? true : undefined} onclick={() => requestAction(m.power_btn_screenOff(), 'screen_lock_portrait', ['shell', 'input', 'keyevent', 'KEYCODE_SLEEP'])}>
        <span slot="icon"><MaterialIcon name="screen_lock_portrait" /></span>
        {m.power_btn_screenOff()}
      </md-filled-tonal-button>
      
      <md-filled-tonal-button disabled={busy ? true : undefined} onclick={() => requestAction(m.power_btn_reboot(), 'restart_alt', ['reboot'])}>
        <span slot="icon"><MaterialIcon name="restart_alt" /></span>
        {m.power_btn_reboot()}
      </md-filled-tonal-button>
      
      <md-filled-tonal-button disabled={busy ? true : undefined} onclick={() => requestAction(m.power_btn_powerOff(), 'power_settings_new', ['shell', 'reboot', '-p'])}>
        <span slot="icon"><MaterialIcon name="power_settings_new" /></span>
        {m.power_btn_powerOff()}
      </md-filled-tonal-button>
      
      <div class="power-dialog__advanced-title">
        <MaterialIcon name="warning" />
        <span><strong>{m.power_advanced_title()}</strong></span>
      </div>
      
      <md-outlined-button disabled={busy ? true : undefined} onclick={() => requestAction('Recovery', 'health_and_safety', ['reboot', 'recovery'], m.power_hint_recovery(), true)}>
        <span slot="icon"><MaterialIcon name="health_and_safety" /></span>
        {m.power_btn_recovery()}
      </md-outlined-button>
      
      <md-outlined-button disabled={busy ? true : undefined} onclick={() => requestAction('Bootloader', 'developer_board', ['reboot', 'bootloader'], m.power_hint_bootloader(), true)}>
        <span slot="icon"><MaterialIcon name="developer_board" /></span>
        {m.power_btn_bootloader()}
      </md-outlined-button>
      
      <md-outlined-button disabled={busy ? true : undefined} onclick={() => requestAction('Fastbootd', 'terminal', ['reboot', 'fastboot'], m.power_hint_fastbootd(), true)}>
        <span slot="icon"><MaterialIcon name="terminal" /></span>
        {m.power_btn_fastbootd()}
      </md-outlined-button>
      
      <md-outlined-button disabled={busy ? true : undefined} onclick={() => requestAction(m.power_btn_download(), 'download', ['reboot', 'download'], m.power_hint_download(), true)}>
        <span slot="icon"><MaterialIcon name="download" /></span>
        {m.power_btn_download()}
      </md-outlined-button>
    </div>
  {/if}
</AppModal>

<style>
:global {
.power-dialog__actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding-bottom:4px}.power-dialog__actions md-filled-tonal-button,.power-dialog__actions md-outlined-button{width:100%;--md-filled-tonal-button-container-height:48px;--md-outlined-button-container-height:48px;--md-filled-tonal-button-container-shape:14px;--md-outlined-button-container-shape:14px}.power-dialog__actions md-filled-tonal-button:nth-child(3){grid-column:1/-1}.power-dialog__advanced-title{grid-column:1/-1;display:flex;align-items:center;gap:10px;margin-top:6px;padding:12px;color:var(--on-tertiary-container);background:var(--tertiary-container);border-radius:14px}.power-dialog__advanced-title>:global(.material-symbols-rounded){font-size:22px}.power-dialog__advanced-title span{display:flex;flex-direction:column;gap:2px}.power-dialog__advanced-title small{font-size:10px;opacity:.75}
.power-dialog__confirm{display:flex;flex-direction:column;gap:16px;padding-bottom:4px;text-align:center}.power-dialog__confirm-icon{font-size:48px;color:var(--primary);margin:0 auto -6px}.power-dialog__confirm p{margin:0;font-size:15px;color:var(--on-surface)}.power-dialog__confirm strong{font-size:18px}.power-dialog__hint{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px;color:var(--on-tertiary-container);background:var(--tertiary-container);border-radius:12px;font-size:13px;text-align:left}.power-dialog__hint>:global(.material-symbols-rounded){font-size:20px;flex-shrink:0}.power-dialog__prompt{color:var(--on-surface-variant)}.power-dialog__confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
@media(max-width:560px){.power-dialog__actions{grid-template-columns:1fr}.power-dialog__actions md-filled-tonal-button:nth-child(3){grid-column:auto}}
}
</style>
