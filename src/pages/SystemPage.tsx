import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { SystemState } from './workbench/types';
import { MaterialIcon } from '../components/MaterialIcon';
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
      
      setStatus('Ajustes del sistema actualizados');
    } catch (error) {
      setStatus(String(error));
    } finally {
      setSystemLoading(false);
    }
  };

  const applySystemAction = async (args: string[], success: string) => {
    if (!serial) return setStatus('Selecciona un dispositivo');
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
    if (!name) return setStatus('Introduce un nombre para el nuevo usuario');
    await applySystemAction(['shell', 'pm', 'create-user', name], `Usuario "${name}" creado`);
    setNewSystemUser('');
  };

  const removeSystemUser = async () => {
    if (!userToDelete) return;
    await applySystemAction(['shell', 'pm', 'remove-user', userToDelete], `Usuario ${userToDelete} eliminado`);
    setUserToDelete(null);
  };

  useEffect(() => {
    refreshSystemState();
  }, [serial]);

  if (!serial) {
    return (
      <div className="md-system-empty">
        <MaterialIcon name="phonelink_off" size={48} className="md-system-empty-icon" />
        <h2>No hay dispositivo conectado</h2>
        <p>Selecciona un dispositivo para administrar el sistema.</p>
      </div>
    );
  }

  const userToDeleteObj = systemState?.users.find(u => String(u.id) === userToDelete);
  const selectedKeyboardInfo = systemState?.keyboards.find(k => k.id === selectedKeyboard);

  return (
    <>
      <div className="md-system-page" style={{ opacity: systemLoading ? 0.6 : 1 }}>
        
        <section className="md-system-card">
          <header className="md-system-header">
            <MaterialIcon name="group" filled size={24} />
            <div>
              <h3>Usuarios del sistema</h3>
              <p>Gestiona los perfiles del dispositivo</p>
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
                  onClick={() => !isCurrent && applySystemAction(['shell', 'am', 'switch-user', String(user.id)], `Cambiado al usuario ${user.id}`)}
                >
                  <MaterialIcon name="person" size={20} />
                  <div className="md-item-content">
                    <strong>{user.name || `Usuario ${user.id}`}</strong>
                    <small>ID: {user.id}</small>
                  </div>
                  
                  {isCurrent ? (
                    <span className="md-badge md-badge-primary">Actual</span>
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
              label="Nuevo usuario"
              value={newSystemUser}
              onInput={(e: any) => setNewSystemUser(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && createSystemUser()}
            ></md-outlined-text-field>
            <md-filled-button onClick={createSystemUser}>
              <MaterialIcon name="add" slot="icon" />
              Crear
            </md-filled-button>
          </div>
        </section>

        <section className="md-system-card">
          <header className="md-system-header">
            <MaterialIcon name="settings_suggest" filled size={24} />
            <div>
              <h3>Ajustes Rápidos</h3>
              <p>Configuraciones globales del sistema</p>
            </div>
          </header>

          <div className="md-system-settings-list">
            <div className="md-setting-row">
              <div className="md-item-content">
                <strong>Idiomas por aplicación</strong>
                <p>Permite configurar el idioma individualmente para cada app</p>
              </div>
              <md-switch 
                selected={systemState?.app_languages_enabled || false}
                onClick={() => applySystemAction(
                  ['shell', 'settings', 'put', 'global', 'settings_app_locale_opt_in_enabled', systemState?.app_languages_enabled ? '0' : '1'], 
                  'Lista de idiomas actualizada'
                )}
              ></md-switch>
            </div>

            <div className="md-setting-row">
              <div className="md-item-content">
                <strong>Navegación por gestos</strong>
                <p>Oculta la barra de navegación clásica</p>
              </div>
              <md-switch 
                selected={systemState?.gestural_navigation || false}
                onClick={() => applySystemAction(
                  ['shell', 'cmd', 'overlay', systemState?.gestural_navigation ? 'disable' : 'enable', 'com.android.internal.systemui.navbar.gestural'], 
                  'Navegación del sistema actualizada'
                )}
              ></md-switch>
            </div>
          </div>
        </section>

        <section className="md-system-card md-full-width">
          <header className="md-system-header">
            <MaterialIcon name="keyboard" filled size={24} />
            <div>
              <h3>Teclados instalados (IME)</h3>
              <p>Activa métodos disponibles y elige el teclado predeterminado.</p>
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
                    <span className="md-badge md-badge-primary">Predeterminado</span>
                  ) : !keyboard.enabled ? (
                    <span className="md-badge md-badge-neutral">Desactivado</span>
                  ) : null}
                </div>
              );
            })}
            
            {!systemState?.keyboards.length && (
              <div className="md-system-inline-empty" style={{ gridColumn: '1 / -1', padding: '24px', textAlign: 'center', color: 'var(--on-surface-variant)' }}>
                <MaterialIcon name="keyboard_off" size={32} />
                <p style={{ margin: '8px 0 0', fontSize: '12px' }}>No se encontraron métodos de entrada.</p>
              </div>
            )}
          </div>

          <footer className="md-system-footer-actions" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid var(--outline-variant)' }}>
            <md-filled-tonal-button 
              disabled={!selectedKeyboardInfo || systemLoading || undefined} 
              onClick={() => selectedKeyboardInfo && applySystemAction(
                ['shell', 'ime', selectedKeyboardInfo.enabled ? 'disable' : 'enable', selectedKeyboardInfo.id], 
                selectedKeyboardInfo.enabled ? 'Teclado deshabilitado' : 'Teclado habilitado'
              )}
            >
              <MaterialIcon slot="icon" name={selectedKeyboardInfo?.enabled ? 'block' : 'check_circle'} />
              {selectedKeyboardInfo?.enabled ? 'Deshabilitar' : 'Habilitar'}
            </md-filled-tonal-button>
            
            <md-filled-button 
              disabled={!selectedKeyboardInfo || systemState?.current_keyboard_id === selectedKeyboard || systemLoading || undefined} 
              onClick={async () => {
                if (selectedKeyboardInfo) {
                  await applySystemAction(['shell', 'ime', 'enable', selectedKeyboardInfo.id], 'Teclado habilitado'); 
                  await applySystemAction(['shell', 'settings', 'put', 'secure', 'default_input_method', selectedKeyboardInfo.id], 'Teclado predeterminado actualizado');
                }
              }}
            >
              <MaterialIcon slot="icon" name="keyboard_alt" />
              Usar como predeterminado
            </md-filled-button>
          </footer>
        </section>

      </div>

      <ConfirmDialog
        open={userToDelete !== null}
        title="Eliminar usuario"
        message={`Se eliminará el usuario "${userToDeleteObj?.name || userToDelete}" y todos sus datos del dispositivo. Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        isDanger={true}
        onConfirm={removeSystemUser}
        onCancel={() => setUserToDelete(null)}
      />
    </>
  );
}