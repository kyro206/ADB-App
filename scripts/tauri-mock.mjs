const command = Bun.spawn([
  'tauri',
  'dev',
  '--config',
  'src-tauri/tauri.mock.conf.json',
], {
  env: {
    ...Bun.env,
    ADB_APP_MOCK: '1',
  },
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});

process.exit(await command.exited);
