import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SystemState } from './workbench/types';
import { MaterialIcon } from '../components/MaterialIcon';
import { useI18n } from '../locales';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';

import '@material/web/button/filled-button.js';
import '@material/web/button/filled-tonal-button.js';
import '@material/web/button/outlined-button.js';
import '@material/web/button/text-button.js';
import '@material/web/iconbutton/icon-button.js';
import '@material/web/switch/switch.js';
import '@material/web/textfield/outlined-text-field.js';

import './SystemPage.css';

interface SystemPageProps {
  serial: string;
  setStatus: (status: string) => void;
}

export function SystemPage({ serial, setStatus }: SystemPageProps) {
  const { t } = useI18n();
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [newSystemUser, setNewSystemUser] = useState('');
  const [systemLoading, setSystemLoading] = useState(false);
  
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [selectedKeyboard, setSelectedKeyboard] = useState('');

  const refreshSystemState = async () => {
    if (!serial) return;
    setSystemLoading(true);
    try {
      const value = await invoke<SystemState>('get_system_state', { serial });
      setSystemState(value);
      
      setSelectedKeyboard(current => 
        value.keyboards.some(keyboard => keyboard.id === current) ? current : value.current_keyboard_id
      );
      
      setStatus('');
    } catch (error) {
      setStatus(String(error));
    } finally {
      setSystemLoading(false);
    }
  };

  const applySystemAction = async (args: string[], success: string) => {
    if (!serial) return setStatus(t('control.error.noDevice'));
    setSystemLoading(true);
    try {
      await invoke<string>('run_device_action', { serial, args });
      setStatus(success);
      await refreshSystemState();
    } catch (error) {
      setStatus(String(error));
    } finally {
      setSystemLoading(false);
    }
  };

  const createSystemUser = async () => {
    const name = newSystemUser.trim();
    if (!name) return setStatus(t('system.error.noUserName'));
    await applySystemAction(['shell', 'pm', 'create-user', name], t('system.status.userCreated', { name }));
    setNewSystemUser('');
  };

  const removeSystemUser = async () => {
    if (!userToDelete) return;
    await applySystemAction(['shell', 'pm', 'remove-user', userToDelete], t('system.status.userRemoved', { name: userToDelete }));
    setUserToDelete(null);
  };

  useEffect(() => {
    refreshSystemState();
  }, [serial]);



  const userToDeleteObj = systemState?.users.find(u => String(u.id) === userToDelete);
  const selectedKeyboardInfo = systemState?.keyboards.find(k => k.id === selectedKeyboard);

  return (
    <>
      <div className="md-system-page" style={{ opacity: systemLoading ? 0.6 : 1 }}>
        
        <section className="md-system-card">
          <header className="md-system-header">
            <MaterialIcon name="group" filled size={24} />
            <div>
              <h3>{t('system.users.title')}</h3>
              <p>{t('system.users.desc')}</p>
            </div>
          </header>

          <div className="md-system-grid md-users-grid">
            {systemState?.users.map(user => {
              const isCurrent = systemState.current_user_id === user.id;
              return (
                <div 
                  key={user.id} 
                  className={`md-system-list-item ${isCurrent ? 'selected' : ''}`}
                  style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                  onClick={() => !isCurrent && applySystemAction(['shell', 'am', 'switch-user', String(user.id)], t('system.status.userSwitched', { id: String(user.id) }))}
                >
                  <MaterialIcon name="person" size={20} />
                  <div className="md-item-content">
                    <strong>{user.name || t('system.users.defaultName', { id: String(user.id) })}</strong>
                    <small>ID: {user.id}</small>
                  </div>
                  
                  {isCurrent ? (
                    <span className="md-badge md-badge-primary">{t('system.users.current')}</span>
                  ) : (
                    <md-icon-button 
                      onClick={(e: React.MouseEvent) => { 
                        e.stopPropagation(); 
                        setUserToDelete(String(user.id)); 
                      }}
                    >
                      <MaterialIcon name="close" />
                    </md-icon-button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="md-system-actions-row">
            <md-outlined-text-field
              label={t('system.users.new')}
              value={newSystemUser}
              onInput={(e: any) => setNewSystemUser(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && createSystemUser()}
            >
              {newSystemUser && <md-icon-button slot="trailing-icon" onClick={() => setNewSystemUser('')}><MaterialIcon name="close" /></md-icon-button>}
            </md-outlined-text-field>
            <md-filled-button onClick={createSystemUser}>
              <MaterialIcon name="add" slot="icon" />
              {t('system.action.create')}
            </md-filled-button>
          </div>
        </section>

        <section className="md-system-card">
          <header className="md-system-header">
            <MaterialIcon name="settings_suggest" filled size={24} />
            <div>
              <h3>{t('system.settings.title')}</h3>
              <p>{t('system.settings.desc')}</p>
            </div>
          </header>

          <div className="md-system-settings-list">
            <div className="md-setting-row">
              <div className="md-item-content">
                <strong>{t('system.settings.appLang')}</strong>
                <p>{t('system.settings.appLangDesc')}</p>
              </div>
              <md-switch 
                selected={systemState?.app_languages_enabled || false}
                onClick={() => applySystemAction(
                  ['shell', 'settings', 'put', 'global', 'settings_app_locale_opt_in_enabled', systemState?.app_languages_enabled ? '0' : '1'], 
                  t('system.status.langUpdated')
                )}
              ></md-switch>
            </div>

            <div className="md-setting-row">
              <div className="md-item-content">
                <strong>{t('system.settings.gestures')}</strong>
                <p>{t('system.settings.gesturesDesc')}</p>
              </div>
              <md-switch 
                selected={systemState?.gestural_navigation || false}
                onClick={() => applySystemAction(
                  ['shell', 'cmd', 'overlay', systemState?.gestural_navigation ? 'disable' : 'enable', 'com.android.internal.systemui.navbar.gestural'], 
                  t('system.status.navUpdated')
                )}
              ></md-switch>
            </div>
          </div>
        </section>

        <section className="md-system-card md-full-width">
          <header className="md-system-header">
            <MaterialIcon name="keyboard" filled size={24} />
            <div>
              <h3>{t('system.ime.title')}</h3>
              <p>{t('system.ime.desc')}</p>
            </div>
          </header>

          <div className="md-system-grid md-keyboards-grid">
            {systemState?.keyboards.map(keyboard => {
              const isDefault = systemState.current_keyboard_id === keyboard.id;
              const isSelected = selectedKeyboard === keyboard.id;
              
              return (
                <div 
                  key={keyboard.id} 
                  className={`md-system-list-item ${isSelected ? 'selected' : ''} ${isDefault ? 'default' : ''}`}
                  onClick={() => setSelectedKeyboard(keyboard.id)}
                >
                  <MaterialIcon name={isDefault ? "keyboard_alt" : "keyboard"} size={20} />
                  <div className="md-item-content">
                    <strong>{keyboard.label || keyboard.id.split('/')[0]}</strong>
                    <small>{keyboard.id.split('/')[1] || keyboard.id}</small>
                  </div>
                  {isDefault ? (
                    <span className="md-badge md-badge-primary">{t('system.ime.default')}</span>
                  ) : !keyboard.enabled ? (
                    <span className="md-badge md-badge-neutral">{t('system.ime.disabled')}</span>
                  ) : null}
                </div>
              );
            })}
            
            {!systemState?.keyboards.length && (
              <div className="md-system-inline-empty" style={{ gridColumn: '1 / -1', padding: '24px', textAlign: 'center', color: 'var(--on-surface-variant)' }}>
                <MaterialIcon name="keyboard_off" size={32} />
                <p style={{ margin: '8px 0 0', fontSize: '12px' }}>{t('system.ime.empty')}</p>
              </div>
            )}
          </div>

          <footer className="md-system-footer-actions" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--outline-variant)' }}>
            <md-filled-tonal-button 
              disabled={!selectedKeyboardInfo || systemLoading || undefined} 
              onClick={() => selectedKeyboardInfo && applySystemAction(
                ['shell', 'ime', selectedKeyboardInfo.enabled ? 'disable' : 'enable', selectedKeyboardInfo.id], 
                selectedKeyboardInfo.enabled ? t('system.status.imeDisabled') : t('system.status.imeEnabled')
              )}
            >
              <MaterialIcon slot="icon" name={selectedKeyboardInfo?.enabled ? 'block' : 'check_circle'} />
              {selectedKeyboardInfo?.enabled ? t('system.action.disable') : t('system.action.enable')}
            </md-filled-tonal-button>
            
            <md-filled-button 
              disabled={!selectedKeyboardInfo || systemState?.current_keyboard_id === selectedKeyboard || systemLoading || undefined} 
              onClick={async () => {
                if (selectedKeyboardInfo) {
                  await applySystemAction(['shell', 'ime', 'enable', selectedKeyboardInfo.id], t('system.status.imeEnabled')); 
                  await applySystemAction(['shell', 'settings', 'put', 'secure', 'default_input_method', selectedKeyboardInfo.id], t('system.status.imeDefaultUpdated'));
                }
              }}
            >
              <MaterialIcon slot="icon" name="keyboard_alt" />
              {t('system.action.setDefault')}
            </md-filled-button>
          </footer>
        </section>

      </div>

      <ConfirmDialog
        open={userToDelete !== null}
        title={t('system.users.deleteTitle')}
        message={t('system.users.deleteDesc', { name: userToDeleteObj?.name || userToDelete || '' })}
        confirmText={t('common.continue')}
        isDanger={true}
        onConfirm={removeSystemUser}
        onCancel={() => setUserToDelete(null)}
      />
    </>
  );
}