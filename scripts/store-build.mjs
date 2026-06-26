import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const tauriConfPath = path.resolve('src-tauri', 'tauri.conf.json');
const originalTauriConf = fs.readFileSync(tauriConfPath, 'utf8');

try {
  console.log('--- Downloading Store Dependencies ---');
  execSync('bun run scripts/download-store-deps.mjs', { stdio: 'inherit' });

  console.log('--- Modifying tauri.conf.json ---');
  const tauriConf = JSON.parse(originalTauriConf);
  if (!tauriConf.bundle) tauriConf.bundle = {};
  if (!tauriConf.bundle.resources) tauriConf.bundle.resources = [];
  tauriConf.bundle.resources.push('store_tools/**/*');
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2));

  console.log('--- Running Store Build ---');
  execSync('tauri-windows-bundle build --runner bun', { 
    stdio: 'inherit', 
    env: { ...process.env, ADB_APP_STORE_BUILD: '1' } 
  });

} finally {
  console.log('--- Restoring tauri.conf.json ---');
  fs.writeFileSync(tauriConfPath, originalTauriConf);
  
  const storeToolsDir = path.resolve('src-tauri', 'store_tools');
  if (fs.existsSync(storeToolsDir)) {
    console.log('--- Cleaning up store_tools ---');
    fs.rmSync(storeToolsDir, { recursive: true, force: true });
  }
}
