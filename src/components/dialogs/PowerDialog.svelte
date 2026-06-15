<script lang="ts" module>
  export type PowerAction = (label: string, args: string[], exitHint?: string) => void;
</script>

<script lang="ts">
  import { i18n } from '../../locales/index.svelte';
  import MaterialIcon from '../MaterialIcon.svelte';
  import AppModal from './AppModal.svelte';
  import './PowerDialog.css';

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
    if (label === i18n.t('power.btn.screenOff')) {
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
  title={confirmStep ? i18n.t('home.power.confirm.title') : i18n.t('power.title')} 
  subtitle={confirmStep ? '' : i18n.t('power.subtitle')}
>
  {#if confirmStep}
    <div class="power-dialog__confirm">
      <MaterialIcon name={confirmStep.icon} class="power-dialog__confirm-icon" />
      <p><strong>{confirmStep.label}</strong></p>
      {#if confirmStep.exitHint}
        <p class="power-dialog__hint">
          <MaterialIcon name="info" />
          <span>{i18n.t('home.power.confirm.exit')} {confirmStep.exitHint}</span>
        </p>
      {/if}
      <div class="power-dialog__confirm-actions">
        <md-text-button onclick={() => confirmStep = null}>{i18n.t('common.cancel')}</md-text-button>
        <md-filled-button class={confirmStep.danger ? 'md-btn-danger' : ''} onclick={executeAction}>
          {i18n.t('common.continue')}
        </md-filled-button>
      </div>
    </div>
  {:else}
    <div class="power-dialog__actions">
      <md-filled-tonal-button disabled={busy ? true : undefined} onclick={() => requestAction(i18n.t('power.btn.screenOff'), 'screen_lock_portrait', ['shell', 'input', 'keyevent', 'KEYCODE_SLEEP'])}>
        <span slot="icon"><MaterialIcon name="screen_lock_portrait" /></span>
        {i18n.t('power.btn.screenOff')}
      </md-filled-tonal-button>
      
      <md-filled-tonal-button disabled={busy ? true : undefined} onclick={() => requestAction(i18n.t('power.btn.reboot'), 'restart_alt', ['reboot'])}>
        <span slot="icon"><MaterialIcon name="restart_alt" /></span>
        {i18n.t('power.btn.reboot')}
      </md-filled-tonal-button>
      
      <md-filled-tonal-button disabled={busy ? true : undefined} onclick={() => requestAction(i18n.t('power.btn.powerOff'), 'power_settings_new', ['shell', 'reboot', '-p'])}>
        <span slot="icon"><MaterialIcon name="power_settings_new" /></span>
        {i18n.t('power.btn.powerOff')}
      </md-filled-tonal-button>
      
      <div class="power-dialog__advanced-title">
        <MaterialIcon name="warning" />
        <span><strong>{i18n.t('power.advanced.title')}</strong></span>
      </div>
      
      <md-outlined-button disabled={busy ? true : undefined} onclick={() => requestAction('Recovery', 'health_and_safety', ['reboot', 'recovery'], i18n.t('power.hint.recovery'), true)}>
        <span slot="icon"><MaterialIcon name="health_and_safety" /></span>
        {i18n.t('power.btn.recovery')}
      </md-outlined-button>
      
      <md-outlined-button disabled={busy ? true : undefined} onclick={() => requestAction('Bootloader', 'developer_board', ['reboot', 'bootloader'], i18n.t('power.hint.bootloader'), true)}>
        <span slot="icon"><MaterialIcon name="developer_board" /></span>
        {i18n.t('power.btn.bootloader')}
      </md-outlined-button>
      
      <md-outlined-button disabled={busy ? true : undefined} onclick={() => requestAction('Fastbootd', 'terminal', ['reboot', 'fastboot'], i18n.t('power.hint.fastbootd'), true)}>
        <span slot="icon"><MaterialIcon name="terminal" /></span>
        {i18n.t('power.btn.fastbootd')}
      </md-outlined-button>
      
      <md-outlined-button disabled={busy ? true : undefined} onclick={() => requestAction(i18n.t('power.btn.download'), 'download', ['reboot', 'download'], i18n.t('power.hint.download'), true)}>
        <span slot="icon"><MaterialIcon name="download" /></span>
        {i18n.t('power.btn.download')}
      </md-outlined-button>
    </div>
  {/if}
</AppModal>
