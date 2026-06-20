import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const targetIndex = args.indexOf('--target');
const target = targetIndex >= 0 ? args[targetIndex + 1] : '';
const storeBuild = args[0] === 'build'
  && args.includes('--no-bundle')
  && target.endsWith('-pc-windows-msvc');

const environment = { ...process.env };
if (storeBuild) {
  environment.ADB_APP_STORE_BUILD = '1';
  environment.VITE_STORE_BUILD = 'true';
  args.push('--config', 'src-tauri/tauri.store.conf.json');
}

const cli = resolve('node_modules/@tauri-apps/cli/tauri.js');
const result = spawnSync(process.execPath, [cli, ...args], {
  env: environment,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
