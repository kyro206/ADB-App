import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MaterialIcon } from '../MaterialIcon';
import './ContextMenu.css';

export interface ContextMenuItem {
  icon?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleContext = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('contextmenu', handleContext);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('contextmenu', handleContext);
    };
  }, [onClose]);

  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let finalX = x;
    let finalY = y;
    
    if (finalX + rect.width > viewportWidth) finalX = viewportWidth - rect.width - 8;
    if (finalY + rect.height > viewportHeight) finalY = viewportHeight - rect.height - 8;
    
    ref.current.style.left = `${finalX}px`;
    ref.current.style.top = `${finalY}px`;
  }, [x, y, items]);

  const menu = (
    <div className="context-menu" ref={ref} style={{ left: x, top: y }}>
      {items.map((item, index) => (
        <button
          key={index}
          className={`context-menu-item ${item.danger ? 'danger' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            if (!item.disabled) {
              item.onClick();
              onClose();
            }
          }}
        >
          {item.icon && <MaterialIcon name={item.icon} size={20} />}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );

  return createPortal(menu, document.body);
}
