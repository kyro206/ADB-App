import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MaterialIcon } from '../MaterialIcon';
import './AppModal.css';

type AppModalProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  width?: 'compact' | 'medium' | 'large';
};

export function AppModal({ open, title, subtitle, children, actions, onClose, width = 'medium' }: AppModalProps) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div className="app-modal-layer" onDoubleClick={event => event.stopPropagation()}>
      <button className="app-modal-scrim" aria-label="Cerrar" onClick={onClose} />
      <section className={`app-modal app-modal--${width}`} role="dialog" aria-modal="true" aria-labelledby="app-modal-title" onClick={event => event.stopPropagation()}>
        <md-elevation />
        <header className="app-modal__header">
          <div><h2 id="app-modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <md-icon-button aria-label="Cerrar" onClick={onClose}><MaterialIcon name="close" /></md-icon-button>
        </header>
        <div className="app-modal__content">{children}</div>
        {actions && <footer className="app-modal__actions">{actions}</footer>}
      </section>
    </div>,
    document.body,
  );
}
