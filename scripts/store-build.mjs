import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';


try {
  console.log('--- Downloading Store Dependencies ---');
  execSync('bun run scripts/download-store-deps.mjs', { stdio: 'inherit' });

  console.log('--- Running Store Build ---');
  execSync('tauri-windows-bundle build --runner bun --config src-tauri/tauri.store.conf.json', { 
    stdio: 'inherit', 
    env: { ...process.env, ADB_APP_STORE_BUILD: '1' } 
  });

} finally {
  const storeToolsDir = path.resolve('src-tauri', 'store_tools');
  if (fs.existsSync(storeToolsDir)) {
    console.log('--- Cleaning up store_tools ---');
    fs.rmSync(storeToolsDir, { recursive: true, force: true });
  }
}
