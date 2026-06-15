<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import type { SystemState } from './workbench/types';
  import { i18n } from '../locales/index.svelte';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import ConfirmDialog from '../components/dialogs/ConfirmDialog.svelte';
  import './SystemPage.css';

  let {
    serial,
    setStatus
  } = $props<{
    serial: string;
    setStatus: (status: string) => void;
  }>();

  let systemState = $state.raw<SystemState | null>(null);
  let newSystemUser = $state('');
  let systemLoading = $state(false);
  
  let userToDelete = $state<string | null>(null);
  let selectedKeyboard = $state('');

  async function refreshSystemState() {
    if (!serial) return;
    systemLoading = true;
    try {
      const value = await invoke<SystemState>('get_system_state', { serial });
      systemState = value;
      
      selectedKeyboard = value.keyboards.some(keyboard => keyboard.id === selectedKeyboard) 
        ? selectedKeyboard 
        : value.current_keyboard_id;
        
      setStatus('');
    } catch (error) {
      setStatus(String(error));
    } finally {
      systemLoading = false;
    }
  }

  async function applySystemAction(args: string[], success: string) {
    if (!serial) return setStatus(i18n.t('control.error.noDevice'));
    systemLoading = true;
    try {
      await invoke<string>('run_device_action', { serial, args });
      setStatus(success);
      await refreshSystemState();
    } catch (error) {
      setStatus(String(error));
    } finally {
      systemLoading = false;
    }
  }

  async function createSystemUser() {
    const name = newSystemUser.trim();
    if (!name) return setStatus(i18n.t('system.error.noUserName'));
    await applySystemAction(['shell', 'pm', 'create-user', name], i18n.t('system.status.userCreated', { name }));
    newSystemUser = '';
  }

  async function removeSystemUser() {
    if (!userToDelete) return;
    await applySystemAction(['shell', 'pm', 'remove-user', userToDelete], i18n.t('system.status.userRemoved', { name: userToDelete }));
    userToDelete = null;
  }

  $effect(() => {
    if (serial) {
      refreshSystemState();
    }
  });

  let userToDeleteObj = $derived(systemState?.users.find(u => String(u.id) === userToDelete));
  let selectedKeyboardInfo = $derived(systemState?.keyboards.find(k => k.id === selectedKeyboard));

</script>

<div class="md-system-page" style="opacity: {systemLoading ? 0.6 : 1}">
  <section class="md-system-card">
    <header class="md-system-header">
      <MaterialIcon name="group" filled size={24} />
      <div>
        <h3>{i18n.t('system.users.title')}</h3>
      </div>
    </header>

    <div class="md-system-grid md-users-grid">
      {#if systemState}
        {#each systemState.users as user (user.id)}
          {@const isCurrent = systemState.current_user_id === user.id}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div 
            class="md-system-list-item {isCurrent ? 'selected' : ''}"
            style="cursor: {isCurrent ? 'default' : 'pointer'}"
            onclick={() => !isCurrent && applySystemAction(['shell', 'am', 'switch-user', String(user.id)], i18n.t('system.status.userSwitched', { id: String(user.id) }))}
          >
            <MaterialIcon name="person" size={20} />
            <div class="md-item-content">
              <strong>{user.name || i18n.t('system.users.defaultName', { id: String(user.id) })}</strong>
              <small>ID: {user.id}</small>
            </div>
            
            {#if isCurrent}
              <span class="md-badge md-badge-primary">{i18n.t('system.users.current')}</span>
            {:else}
              <md-icon-button 
                onclick={(e: MouseEvent) => { 
                  e.stopPropagation(); 
                  userToDelete = String(user.id); 
                }}
              >
                <MaterialIcon name="close" />
              </md-icon-button>
            {/if}
          </div>
        {/each}
      {/if}
    </div>

    <div class="md-system-actions-row">
      <md-outlined-text-field
        label={i18n.t('system.users.new')}
        value={newSystemUser}
        oninput={(e: any) => newSystemUser = e.target.value}
        onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && createSystemUser()}
      >
        {#if newSystemUser}
          <md-icon-button slot="trailing-icon" onclick={() => newSystemUser = ''}><MaterialIcon name="close" /></md-icon-button>
        {/if}
      </md-outlined-text-field>
      <md-filled-button onclick={createSystemUser}>
        <MaterialIcon name="add" slot="icon" />
        {i18n.t('system.action.create')}
      </md-filled-button>
    </div>
  </section>

  <section class="md-system-card">
    <header class="md-system-header">
      <MaterialIcon name="settings_suggest" filled size={24} />
      <div>
        <h3>{i18n.t('system.settings.title')}</h3>
      </div>
    </header>

    <div class="md-system-settings-list">
      <div class="md-setting-row">
        <div class="md-item-content">
          <strong>{i18n.t('system.settings.appLang')}</strong>
          <p>{i18n.t('system.settings.appLangDesc')}</p>
        </div>
        <!-- svelte-ignore a11y_missing_attribute -->
        <md-switch 
          selected={systemState?.app_languages_enabled ? true : undefined}
          onclick={() => applySystemAction(
            ['shell', 'settings', 'put', 'global', 'settings_app_locale_opt_in_enabled', systemState?.app_languages_enabled ? '0' : '1'], 
            i18n.t('system.status.langUpdated')
          )}
        ></md-switch>
      </div>

      <div class="md-setting-row">
        <div class="md-item-content">
          <strong>{i18n.t('system.settings.gestures')}</strong>
          <p>{i18n.t('system.settings.gesturesDesc')}</p>
        </div>
        <!-- svelte-ignore a11y_missing_attribute -->
        <md-switch 
          selected={systemState?.gestural_navigation ? true : undefined}
          onclick={() => applySystemAction(
            ['shell', 'cmd', 'overlay', systemState?.gestural_navigation ? 'disable' : 'enable', 'com.android.internal.systemui.navbar.gestural'], 
            i18n.t('system.status.navUpdated')
          )}
        ></md-switch>
      </div>
    </div>
  </section>

  <section class="md-system-card md-full-width">
    <header class="md-system-header">
      <MaterialIcon name="keyboard" filled size={24} />
      <div>
        <h3>{i18n.t('system.ime.title')}</h3>
      </div>
    </header>

    <div class="md-system-grid md-keyboards-grid">
      {#if systemState}
        {#each systemState.keyboards as keyboard (keyboard.id)}
          {@const isDefault = systemState.current_keyboard_id === keyboard.id}
          {@const isSelected = selectedKeyboard === keyboard.id}
          
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div 
            class="md-system-list-item {isSelected ? 'selected' : ''} {isDefault ? 'default' : ''}"
            onclick={() => selectedKeyboard = keyboard.id}
          >
            <MaterialIcon name={isDefault ? "keyboard_alt" : "keyboard"} size={20} />
            <div class="md-item-content">
              <strong>{keyboard.label || keyboard.id.split('/')[0]}</strong>
              <small>{keyboard.id.split('/')[1] || keyboard.id}</small>
            </div>
            {#if isDefault}
              <span class="md-badge md-badge-primary">{i18n.t('system.ime.default')}</span>
            {:else if !keyboard.enabled}
              <span class="md-badge md-badge-neutral">{i18n.t('system.ime.disabled')}</span>
            {/if}
          </div>
        {/each}
        
        {#if !systemState.keyboards.length}
          <div class="md-system-inline-empty" style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--on-surface-variant)">
            <MaterialIcon name="keyboard_off" size={32} />
            <p style="margin: 8px 0 0; font-size: 12px">{i18n.t('system.ime.empty')}</p>
          </div>
        {/if}
      {/if}
    </div>

    <footer class="md-system-footer-actions" style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--outline-variant)">
      <md-filled-tonal-button 
        disabled={!selectedKeyboardInfo || systemLoading ? true : undefined} 
        onclick={() => selectedKeyboardInfo && applySystemAction(
          ['shell', 'ime', selectedKeyboardInfo.enabled ? 'disable' : 'enable', selectedKeyboardInfo.id], 
          selectedKeyboardInfo.enabled ? i18n.t('system.status.imeDisabled') : i18n.t('system.status.imeEnabled')
        )}
      >
        <MaterialIcon slot="icon" name={selectedKeyboardInfo?.enabled ? 'block' : 'check_circle'} />
        {selectedKeyboardInfo?.enabled ? i18n.t('system.action.disable') : i18n.t('system.action.enable')}
      </md-filled-tonal-button>
      
      <md-filled-button 
        disabled={!selectedKeyboardInfo || systemState?.current_keyboard_id === selectedKeyboard || systemLoading ? true : undefined} 
        onclick={async () => {
          if (selectedKeyboardInfo) {
            await applySystemAction(['shell', 'ime', 'enable', selectedKeyboardInfo.id], i18n.t('system.status.imeEnabled')); 
            await applySystemAction(['shell', 'settings', 'put', 'secure', 'default_input_method', selectedKeyboardInfo.id], i18n.t('system.status.imeDefaultUpdated'));
          }
        }}
      >
        <MaterialIcon slot="icon" name="keyboard_alt" />
        {i18n.t('system.action.setDefault')}
      </md-filled-button>
    </footer>
  </section>
</div>

<ConfirmDialog
  open={userToDelete !== null}
  title={i18n.t('system.users.deleteTitle')}
  message={i18n.t('system.users.deleteDesc', { name: userToDeleteObj?.name || userToDelete || '' })}
  confirmText={i18n.t('common.continue')}
  isDanger={true}
  onConfirm={removeSystemUser}
  onCancel={() => userToDelete = null}
/>
