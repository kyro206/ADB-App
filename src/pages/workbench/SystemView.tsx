import { MaterialIcon } from '../../components/MaterialIcon';
import type { KeyboardInputMethod, SystemState } from './types';

interface SystemViewProps {
  connected: boolean;
  state: SystemState | null;
  loading: boolean;
  selectedUser: string;
  newUser: string;
  selectedKeyboard: string;
  onSelectedUserChange: (value: string) => void;
  onNewUserChange: (value: string) => void;
  onSelectedKeyboardChange: (value: string) => void;
  onCreateUser: () => void;
  onRemoveUser: () => void;
  onSwitchUser: () => void;
  onToggleAppLanguages: () => void;
  onToggleGestures: () => void;
  onToggleKeyboard: (keyboard: KeyboardInputMethod) => void;
  onSetDefaultKeyboard: (keyboard: KeyboardInputMethod) => void;
  onRefresh: () => void;
}

function SettingCard({ icon, title, description, supporting, checked, disabled, onToggle }: {
  icon: string; title: string; description: string; supporting: string;
  checked: boolean; disabled: boolean; onToggle: () => void;
}) {
  return <article className={`system-material-setting ${checked ? 'active' : ''}`}>
    <span className="system-material-icon"><MaterialIcon name={icon} filled={checked} /></span>
    <div className="system-material-setting__copy"><h3>{title}</h3><p>{description}</p><span>{supporting}</span></div>
    <md-switch selected={checked || undefined} disabled={disabled || undefined} aria-label={title} onClick={onToggle} />
  </article>;
}

export function SystemView(props: SystemViewProps) {
  const { connected, state, loading, selectedUser, newUser, selectedKeyboard } = props;
  if (!connected) return <div className="system-material-empty"><span className="system-material-empty__icon"><MaterialIcon name="settings_suggest" /></span><h2>Conecta un dispositivo</h2><p>La administración del sistema estará disponible cuando ADB detecte un dispositivo.</p></div>;

  const selectedUserIsCurrent = selectedUser === String(state?.current_user_id);
  const selectedKeyboardInfo = state?.keyboards.find(keyboard => keyboard.id === selectedKeyboard);

  return <div className="system-material-page">
    <div className="system-material-layout">
      <section className="system-material-card system-material-users">
        <header className="system-material-card__header"><span className="system-material-icon"><MaterialIcon name="group" /></span><div><h3>Usuarios</h3><p>Cambia de perfil o crea un espacio independiente.</p></div><span className="system-material-count">{state?.users.length || 0}</span></header>
        <div className="system-material-user-grid">
          {state?.users.map(user => <button key={user.id} className={`system-material-user ${selectedUser === String(user.id) ? 'selected' : ''}`} onClick={() => props.onSelectedUserChange(String(user.id))}>
            <span className="system-material-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="system-material-user__copy"><strong>{user.name}</strong><small>ID {user.id}{user.is_running ? ' · sesión activa' : ''}</small></span>{user.id === state.current_user_id && <span className="system-material-badge"><MaterialIcon name="check" />Actual</span>}<md-ripple />
          </button>)}
        </div>
        <div className="system-material-create">
          <md-outlined-text-field label="Nombre del nuevo usuario" value={newUser} disabled={loading || undefined} onInput={(event: Event) => props.onNewUserChange((event.target as HTMLInputElement).value)} onKeyDown={(event: KeyboardEvent) => { if (event.key === 'Enter') props.onCreateUser(); }}><MaterialIcon slot="leading-icon" name="person_add" /></md-outlined-text-field>
          <md-filled-button disabled={!newUser.trim() || loading || undefined} onClick={props.onCreateUser}><MaterialIcon slot="icon" name="add" />Crear usuario</md-filled-button>
        </div>
        <footer className="system-material-actions">
          <md-filled-tonal-button disabled={!selectedUser || selectedUserIsCurrent || loading || undefined} onClick={props.onSwitchUser}><MaterialIcon slot="icon" name="switch_account" />Cambiar usuario</md-filled-tonal-button>
          <md-text-button className="system-material-danger" disabled={!selectedUser || selectedUserIsCurrent || loading || undefined} onClick={props.onRemoveUser}><MaterialIcon slot="icon" name="delete" />Eliminar</md-text-button>
        </footer>
      </section>

      <section className="system-material-quick">
        <header><span>Ajustes rápidos</span><h3>Comportamiento de Android</h3></header>
        <SettingCard icon="translate" title="Idiomas por aplicación" description="Muestra todas las apps en el selector de idioma de Android." supporting={state?.app_languages_enabled ? 'Todas las aplicaciones visibles' : 'Solo aplicaciones compatibles'} checked={state?.app_languages_enabled || false} disabled={!state || loading} onToggle={props.onToggleAppLanguages} />
        <SettingCard icon="swipe" title="Navegación por gestos" description="Cambia entre navegación gestual y botones del sistema." supporting={state?.gestural_navigation ? 'Navegación por gestos activa' : 'Navegación mediante botones activa'} checked={state?.gestural_navigation || false} disabled={!state || loading} onToggle={props.onToggleGestures} />
      </section>

      <section className="system-material-card system-material-keyboards">
        <header className="system-material-card__header"><span className="system-material-icon"><MaterialIcon name="keyboard" /></span><div><h3>Teclados y métodos de entrada</h3><p>Activa métodos disponibles y elige el teclado predeterminado.</p></div><span className="system-material-count">{state?.keyboards.length || 0}</span></header>
        <div className="system-material-keyboard-grid">
          {state?.keyboards.map(keyboard => <button key={keyboard.id} className={`system-material-keyboard ${selectedKeyboard === keyboard.id ? 'selected' : ''}`} onClick={() => props.onSelectedKeyboardChange(keyboard.id)}>
            <span className="system-material-keyboard__icon"><MaterialIcon name={keyboard.is_default ? 'keyboard_alt' : 'keyboard'} filled={keyboard.enabled} /></span><span className="system-material-keyboard__copy"><strong>{keyboard.label || keyboard.id}</strong><code>{keyboard.id}</code></span><span className={`system-material-badge ${keyboard.is_default ? 'primary' : ''}`}>{keyboard.is_default ? 'Predeterminado' : keyboard.enabled ? 'Activado' : 'Desactivado'}</span><md-ripple />
          </button>)}
          {!state?.keyboards.length && <div className="system-material-inline-empty"><MaterialIcon name="keyboard_off" /><span>No se encontraron métodos de entrada.</span></div>}
        </div>
        <footer className="system-material-actions">
          <md-filled-tonal-button disabled={!selectedKeyboardInfo || loading || undefined} onClick={() => selectedKeyboardInfo && props.onToggleKeyboard(selectedKeyboardInfo)}><MaterialIcon slot="icon" name={selectedKeyboardInfo?.enabled ? 'block' : 'check_circle'} />{selectedKeyboardInfo?.enabled ? 'Deshabilitar' : 'Habilitar'}</md-filled-tonal-button>
          <md-filled-button disabled={!selectedKeyboardInfo || selectedKeyboardInfo.is_default || loading || undefined} onClick={() => selectedKeyboardInfo && props.onSetDefaultKeyboard(selectedKeyboardInfo)}><MaterialIcon slot="icon" name="keyboard_alt" />Usar como predeterminado</md-filled-button>
        </footer>
      </section>
    </div>
  </div>;
}
