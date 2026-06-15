import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [svelte({
    onwarn: (warning, handler) => {
      // Ignore a11y warnings, especially for <md-*> custom elements
      if (warning.code.startsWith('a11y_') || warning.code.startsWith('a11y-')) return;
      // Handle locally referenced state warning which is a false positive for $state initializers
      if (warning.code === 'state_referenced_locally') return;
      
      handler(warning);
    }
  })],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@material/web')) return 'material';
            if (id.includes('@tauri-apps')) return 'tauri';
            if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
            return 'vendor-other';
          }
        }
      }
    }
  },
}));
