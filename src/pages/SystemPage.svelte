<script lang="ts">
import * as m from '../paraglide/messages';


  import { invoke } from '@tauri-apps/api/core';
  import type { SystemState } from './workbench/types';
  import MaterialIcon from '../components/MaterialIcon.svelte';
  import ConfirmDialog from '../components/dialogs/ConfirmDialog.svelte';
  import { materialTextFieldValue } from '../actions/materialTextFieldValue';
  import { devicesState } from '../context/devices.svelte';
  let {
    serial,
    status = $bindable()
  } = $props<{
    serial: string;
    status: string;
  }>();

  let systemState = $state.raw<SystemState | null>(null);
  let newSystemUser = $state('');
  let systemLoading = $state(false);
  
  let userToDelete = $state<string | null>(null);
  let selectedKeyboard = $state('');

  type AdvancedOption = {
    id: string;
    title: string;
    description: string;
    isRecommended: (deviceType?: string) => boolean;
    value: boolean;
    onToggle: () => void;
    onReset?: () => void;
  };

  async function refreshSystemState() {
    if (!serial) return;
    systemLoading = true;
    try {
      const value = await invoke<SystemState>('get_system_state', { serial });
      systemState = value;
      
      selectedKeyboard = value.keyboards.some(keyboard => keyboard.id === selectedKeyboard) 
        ? selectedKeyboard 
        : value.current_keyboard_id;
        
      status = '';
    } catch (error) {
      status = String(error);
    } finally {
      systemLoading = false;
    }
  }

  async function applySystemAction(args: string[], success: string) {
    if (!serial) return status = m.control_error_noDevice();
    systemLoading = true;
    try {
      await invoke<string>('run_device_action', { serial, args });
      status = success;
      await refreshSystemState();
    } catch (error) {
      status = String(error);
    } finally {
      systemLoading = false;
    }
  }

  async function createSystemUser() {
    const name = newSystemUser.trim();
    if (!name) return status = m.system_error_noUserName();
    await applySystemAction(['shell', 'pm', 'create-user', name], m.system_status_userCreated({ name }));
    newSystemUser = '';
  }

  async function removeSystemUser() {
    if (!userToDelete) return;
    await applySystemAction(['shell', 'pm', 'remove-user', userToDelete], m.system_status_userRemoved({ name: userToDelete }));
    userToDelete = null;
  }

  $effect(() => {
    if (serial) {
      refreshSystemState();
    }
  });

  let userToDeleteObj = $derived(systemState?.users.find(u => String(u.id) === userToDelete));
  let selectedKeyboardInfo = $derived(systemState?.keyboards.find(k => k.id === selectedKeyboard));

  let advancedOptions = $derived<AdvancedOption[]>([
    {
      id: 'captive_portal',
      title: m.system_advanced_captivePortal(),
      description: m.system_advanced_captivePortalDesc(),
      isRecommended: (type) => type === 'watch',
      value: systemState?.captive_portal_mode !== '0',
      onToggle: () => {
        const isCurrentlyDisabled = systemState?.captive_portal_mode === '0';
        const actionArgs = isCurrentlyDisabled 
          ? ['shell', 'settings', 'put', 'global', 'captive_portal_mode', '1'] 
          : ['shell', 'settings', 'put', 'global', 'captive_portal_mode', '0'];
        applySystemAction(actionArgs, m.system_status_captivePortalUpdated());
      },
      onReset: () => {
        applySystemAction(['shell', 'settings', 'delete', 'global', 'captive_portal_mode'], m.system_status_captivePortalUpdated());
      }
    }
  ].sort((a, b) => {
    const deviceType = devicesState.deviceDetails?.device_type;
    const aRec = a.isRecommended(deviceType);
    const bRec = b.isRecommended(deviceType);
    if (aRec && !bRec) return -1;
    if (!aRec && bRec) return 1;
    return 0;
  }));

</script>

<div class="md-system-page" style="opacity: {systemLoading ? 0.6 : 1}">
  <section class="md-system-card">
    <header class="md-system-header">
      <MaterialIcon name="group" filled size={24} />
      <div>
        <h3>{m.system_users_title()}</h3>
      </div>
    </header>

    <div class="md-system-grid md-users-grid">
      {#if systemState}
        {#each systemState.users as user (user.id)}
          {@const isCurrent = systemState.current_user_id === user.id}
          <div 
            class="md-system-list-item {isCurrent ? 'selected' : ''}"
            style="cursor: {isCurrent ? 'default' : 'pointer'}"
            onclick={() => !isCurrent && applySystemAction(['shell', 'am', 'switch-user', String(user.id)], m.system_status_userSwitched({ id: String(user.id) }))}
          >
            <MaterialIcon name="person" size={20} />
            <div class="md-item-content">
              <strong>{user.name || m.system_users_defaultName({ id: String(user.id) })}</strong>
              <small>ID: {user.id}</small>
            </div>
            
            {#if isCurrent}
              <span class="md-badge md-badge-primary">{m.system_users_current()}</span>
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
        label={m.system_users_new()}
        use:materialTextFieldValue={newSystemUser}
        oninput={(e: any) => newSystemUser = e.target.value}
        onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && createSystemUser()}
      >
        {#if newSystemUser}
          <md-icon-button slot="trailing-icon" onclick={() => newSystemUser = ''}><MaterialIcon name="close" /></md-icon-button>
        {/if}
      </md-outlined-text-field>
      <md-filled-button onclick={createSystemUser}>
        <MaterialIcon name="add" slot="icon" />
        {m.system_action_create()}
      </md-filled-button>
    </div>
  </section>

  <section class="md-system-card">
    <header class="md-system-header">
      <MaterialIcon name="settings_suggest" filled size={24} />
      <div>
        <h3>{m.system_settings_title()}</h3>
      </div>
    </header>

    <div class="md-system-settings-list">
      <div class="md-setting-row">
        <div class="md-item-content">
          <strong>{m.system_settings_appLang()}</strong>
          <p>{m.system_settings_appLangDesc()}</p>
        </div>
        <md-switch 
          selected={systemState?.app_languages_enabled ?? false}
          onclick={() => applySystemAction(
            ['shell', 'settings', 'put', 'global', 'settings_app_locale_opt_in_enabled', systemState?.app_languages_enabled ? '0' : '1'], 
            m.system_status_langUpdated()
          )}
        ></md-switch>
      </div>

      <div class="md-setting-row">
        <div class="md-item-content">
          <strong>{m.system_settings_gestures()}</strong>
          <p>{m.system_settings_gesturesDesc()}</p>
        </div>
        <md-switch 
          selected={systemState?.gestural_navigation ?? false}
          onclick={() => applySystemAction(
            ['shell', 'cmd', 'overlay', systemState?.gestural_navigation ? 'disable' : 'enable', 'com.android.internal.systemui.navbar.gestural'], 
            m.system_status_navUpdated()
          )}
        ></md-switch>
      </div>
    </div>
  </section>


  <section class="md-system-card md-full-width">
    <header class="md-system-header">
      <MaterialIcon name="keyboard" filled size={24} />
      <div>
        <h3>{m.system_ime_title()}</h3>
      </div>
    </header>

    <div class="md-system-grid md-keyboards-grid">
      {#if systemState}
        {#each systemState.keyboards as keyboard (keyboard.id)}
          {@const isDefault = systemState.current_keyboard_id === keyboard.id}
          {@const isSelected = selectedKeyboard === keyboard.id}
          
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
              <span class="md-badge md-badge-primary">{m.system_ime_default()}</span>
            {:else if !keyboard.enabled}
              <span class="md-badge md-badge-neutral">{m.system_ime_disabled()}</span>
            {/if}
          </div>
        {/each}
        
        {#if !systemState.keyboards.length}
          <div class="md-system-inline-empty" style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--on-surface-variant)">
            <MaterialIcon name="keyboard_off" size={32} />
            <p style="margin: 8px 0 0; font-size: 12px">{m.system_ime_empty()}</p>
          </div>
        {/if}
      {/if}
    </div>

    <footer class="md-system-footer-actions" style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--outline-variant)">
      <md-filled-tonal-button 
        disabled={!selectedKeyboardInfo || systemLoading ? true : undefined} 
        onclick={() => selectedKeyboardInfo && applySystemAction(
          ['shell', 'ime', selectedKeyboardInfo.enabled ? 'disable' : 'enable', selectedKeyboardInfo.id], 
          selectedKeyboardInfo.enabled ? m.system_status_imeDisabled() : m.system_status_imeEnabled()
        )}
      >
        <MaterialIcon slot="icon" name={selectedKeyboardInfo?.enabled ? 'block' : 'check_circle'} />
        {selectedKeyboardInfo?.enabled ? m.system_action_disable() : m.system_action_enable()}
      </md-filled-tonal-button>
      
      <md-filled-button 
        disabled={!selectedKeyboardInfo || systemState?.current_keyboard_id === selectedKeyboard || systemLoading ? true : undefined} 
        onclick={async () => {
          if (selectedKeyboardInfo) {
            await applySystemAction(['shell', 'ime', 'enable', selectedKeyboardInfo.id], m.system_status_imeEnabled()); 
            await applySystemAction(['shell', 'settings', 'put', 'secure', 'default_input_method', selectedKeyboardInfo.id], m.system_status_imeDefaultUpdated());
          }
        }}
      >
        <MaterialIcon slot="icon" name="keyboard_alt" />
        {m.system_action_setDefault()}
      </md-filled-button>
    </footer>
  </section>

  <section class="md-system-card md-full-width">
    <header class="md-system-header">
      <MaterialIcon name="build" filled size={24} />
      <div>
        <h3>{m.system_advanced_title()}</h3>
      </div>
    </header>

    <div class="md-system-settings-list">
      {#each advancedOptions as option (option.id)}
        <div class="md-setting-row" style="align-items: flex-start;">
          <div class="md-item-content">
            <strong style="display: flex; align-items: center; gap: 8px;">
              {option.title}
              {#if option.isRecommended(devicesState.deviceDetails?.device_type)}
                <span class="md-badge md-badge-primary">{m.system_advanced_recommended()}</span>
              {/if}
            </strong>
            <p>{option.description}</p>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            {#if option.onReset}
              <md-icon-button title={m.common_reset()} onclick={option.onReset}>
                <MaterialIcon name="restart_alt" />
              </md-icon-button>
            {/if}
            <md-switch 
              selected={option.value}
              onclick={option.onToggle}
            ></md-switch>
          </div>
        </div>
      {/each}
    </div>
  </section>
</div>

<ConfirmDialog
  open={userToDelete !== null}
  title={m.system_users_deleteTitle()}
  message={m.system_users_deleteDesc({ name: userToDeleteObj?.name || userToDelete || '' })}
  confirmText={m.common_continue()}
  isDanger={true}
  onConfirm={removeSystemUser}
  onCancel={() => userToDelete = null}
/>

<style>
:global {
.md-system-page {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(350px, 1fr);
    gap: 16px;
    width: 100%;
    color: var(--on-surface, #1d1b20);
    transition: opacity 0.2s ease;
}

/* Tarjetas Material 3 */
.md-system-card {
    display: flex;
    flex-direction: column;
    padding: 24px;
    background: var(--surface-container-low, #f7f2fa);
    border: 1px solid var(--outline-variant, #cac4d0);
    border-radius: 24px;
}

.md-full-width {
    grid-column: 1 / -1;
}

/* Cabeceras de tarjetas */
.md-system-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
}

.md-system-header :global(.material-symbols-rounded) {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    color: var(--on-primary-container, #21005d);
    background: var(--primary-container, #eaddff);
    border-radius: 16px;
}

.md-system-header h3 {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: 500;
}

/* Grids compartidos */
.md-system-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
    max-height: 350px;
    overflow-y: auto;
    padding-right: 8px; /* Espacio para scrollbar */
}

/* Items de listas (Usuarios) */
.md-system-list-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--surface-container, #f3edf7);
    border: 1px solid transparent;
    border-radius: 16px;
    transition: all 0.2s ease;
}

.md-system-list-item:hover {
    background: var(--surface-container-high, #ece6f0);
}

.md-system-list-item.selected {
    background: var(--primary-container, #eaddff);
    border-color: var(--primary, #6750a4);
}

/* Tarjetas de Teclados (Contenido arriba, acciones abajo) */
.md-system-keyboard-card {
    display: flex;
    flex-direction: column;
    background: var(--surface-container, #f3edf7);
    border: 1px solid transparent;
    border-radius: 16px;
    overflow: hidden;
}

.md-system-keyboard-card.default {
    background: color-mix(in srgb, var(--primary-container, #eaddff) 40%, var(--surface-container));
    border: 1px solid var(--primary, #6750a4);
}

.md-system-keyboard-info {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 16px 8px 16px;
}

.md-keyboard-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    padding: 8px 16px 16px 16px;
}

.md-avatar {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    color: var(--on-surface-variant, #49454f);
    background: var(--surface-container-highest, #e6e0e9);
    border-radius: 50%;
}

.selected .md-avatar, .default .md-avatar {
    color: var(--on-primary-container, #21005d);
    background: rgba(255, 255, 255, 0.5);
}

.md-item-content {
    flex: 1;
    min-width: 0;
}

.md-item-content strong {
    display: block;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.md-item-content small {
    display: block;
    margin-top: 2px;
    color: var(--on-surface-variant, #49454f);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.md-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px; /* Altura estándar M3 para mini-chips */
    padding: 0 8px;
    border-radius: 8px; /* Radio estándar para etiquetas de estado */
    font-size: 12px; /* label-medium */
    font-weight: 500;
    letter-spacing: 0.1px;
}

.md-badge-primary {
    color: var(--on-secondary-container, #1d192b);
    background: var(--secondary-container, #e8def8);
}

.md-badge-neutral {
    color: var(--on-surface-variant, #49454f);
    background: var(--surface-container-highest, #e6e0e9);
}

.selected .md-badge-primary, 
.default .md-badge-primary {
    color: var(--on-primary, #ffffff);
    background: var(--primary, #6750a4);
}

/* Fila de creación de usuario */
.md-system-actions-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid var(--outline-variant, #cac4d0);
}

.md-system-actions-row md-outlined-text-field {
    flex: 1;
    --md-outlined-field-container-shape: 16px;
}


md-icon-button {
    --md-icon-button-icon-color: var(--on-surface-variant);
}

md-icon-button:hover {
    --md-icon-button-icon-color: var(--error, #b3261e);
}

/* Lista de Ajustes (Switches) */
.md-system-settings-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.md-setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px;
    background: var(--surface-container, #f3edf7);
    border-radius: 16px;
}

.md-setting-row strong {
    font-size: 14px;
    font-weight: 500;
}


/* Responsive */
@media (max-width: 1024px) {
    .md-system-page {
        grid-template-columns: 1fr;
    }
}

@media (max-width: 600px) {
    .md-system-grid {
        grid-template-columns: 1fr;
    }
    .md-system-actions-row {
        flex-direction: column;
        align-items: stretch;
    }
    .md-keyboard-actions {
        justify-content: stretch;
        flex-direction: column;
    }
    .md-keyboard-actions > * {
        width: 100%;
    }
}
}
</style>
