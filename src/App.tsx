import { AppLayout } from './components/layout/AppLayout';
import { MaterialWebEnhancer } from './components/MaterialWebEnhancer';
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    // 1. Desactivar el menú contextual (clic derecho)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    
    // 2. Desactivar teclas de acciones
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F5' || 
        e.key === 'F3' ||
        e.key === 'F7' ||
        ((e.ctrlKey || e.metaKey) && e.key === 'r') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'R') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'p') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'P')
      ) {
        e.preventDefault();
      }
    };

    // Añadir los escuchadores de eventos al documento
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    // Limpieza de eventos cuando el componente se desmonte
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  
  return (
    <>
      <MaterialWebEnhancer />
      <AppLayout />
    </>
  );
}

export default App;