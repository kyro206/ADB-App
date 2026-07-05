# Contexto del Proyecto
Estás trabajando en una aplicación de escritorio usando Tauri v2, Rust en el backend y Svelte con Bun en el frontend. El objetivo es crear una app ADB GUI de bajo peso y maximo rendimiento. La aplicación es multiplataforma con lo que usa los elementos nativos de Tauri, trata de usar las menores dependencias posibles.

# Reglas Estrictas de Tauri v2
1. NUNCA uses la API de Tauri v1.
2. Gestión de Estado y Rutas: Usa `tauri::Manager`. Ejemplo: `app.path().app_config_dir()` en lugar del obsoleto `app.path_resolver()`.
3. Emisión de eventos: Usa `app.emit()` en lugar de `app.emit_all()`.
4. Plugins: En Tauri v2, las APIs del sistema están en plugins separados.
   - Frontend: Usa importaciones como `import { baseDir } from '@tauri-apps/plugin-fs'`.
   - Backend: Asegúrate de que los plugins estén inicializados en `Builder::new().plugin(...)` en `main.rs`.
5. IPC (Comandos): Los comandos de Rust deben devolver un `Result<T, AppError>` (implementando `Serialize`) para un manejo de errores estructurado y limpio en el frontend.

Los textos se guardan en /messages, tienes que añadirlos en formato json, cuando añadas un texto añadelo, cuando lo quites a no ser que sea común, quitalo, trata siempre de usar comunes

Nunca debes usar la consola para advertir de errores, siempre tienes que ponerlo en el estado

Recuerda siempre al final ver que compila y pasa los tests