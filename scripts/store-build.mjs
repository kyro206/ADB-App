import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const STORE_TOOLS_DIR = path.resolve('src-tauri', 'store_tools');
const TEMP_DIR = path.join(STORE_TOOLS_DIR, 'temp');

const WINDOWS_GEN_DIR = path.resolve('src-tauri', 'gen', 'windows');
const ASSETS_DIR = path.join(WINDOWS_GEN_DIR, 'Assets');
const CONFIG_FILE = path.join(WINDOWS_GEN_DIR, 'bundle.config.json');
const MANIFEST_TEMPLATE = path.join(WINDOWS_GEN_DIR, 'AppxManifest.xml.template');
const WIDE_LOGO = path.join(ASSETS_DIR, 'Wide310x150Logo.png');

const TAURI_CONF_PATH = path.resolve('src-tauri', 'tauri.conf.json');

const USER_AGENT = 'ADB-App-Builder';

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removeIfExists(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function run(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  execFileSync(command, args, {
    stdio: 'inherit',
    ...options,
  });
}

function localBinary(name) {
  const binaryName = process.platform === 'win32' ? `${name}.cmd` : name;
  const candidate = path.resolve('node_modules', '.bin', binaryName);
  return fs.existsSync(candidate) ? candidate : null;
}

function runTauriWindowsBundle(args, options = {}) {
  const local = localBinary('tauri-windows-bundle');

  if (local) {
    run(local, args, options);
    return;
  }

  run('bun', ['x', '@choochmeque/tauri-windows-bundle@latest', ...args], options);
}

async function fetchJson(url, description) {
  const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github+json, application/json',
  };

  if (process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com/')) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(url, { headers });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to fetch ${description}: HTTP ${res.status} ${res.statusText}\n${text.slice(0, 500)}`
    );
  }

  return await res.json();
}

async function fetchLatestGithubRelease(repo) {
  return await fetchJson(
    `https://api.github.com/repos/${repo}/releases/latest`,
    `${repo} latest release`
  );
}

function assertZipFile(zipPath) {
  const fd = fs.openSync(zipPath, 'r');
  const header = Buffer.alloc(4);
  fs.readSync(fd, header, 0, 4, 0);
  fs.closeSync(fd);

  const isZip = header[0] === 0x50 && header[1] === 0x4b;

  if (!isZip) {
    const preview = fs.readFileSync(zipPath).subarray(0, 300).toString('utf8');
    throw new Error(
      `${zipPath} is not a valid ZIP file. First bytes: ${header.toString('hex')}\n` +
      `Response preview:\n${preview}`
    );
  }
}

async function downloadFile(url, dest, { expectZip = false } = {}) {
  console.log(`Downloading ${url}...`);
  ensureDir(path.dirname(dest));

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/octet-stream,*/*',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to download ${url}: HTTP ${res.status} ${res.statusText}\n${text.slice(0, 500)}`
    );
  }

  const buffer = Buffer.from(await res.arrayBuffer());

  if (buffer.length === 0) {
    throw new Error(`Downloaded file is empty: ${url}`);
  }

  fs.writeFileSync(dest, buffer);

  if (expectZip) {
    assertZipFile(dest);
  }
}

function extractZip(zipPath, destDir) {
  console.log(`Extracting ${zipPath} to ${destDir}...`);

  removeIfExists(destDir);
  ensureDir(destDir);

  if (process.platform === 'win32') {
    run('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath ${psQuote(zipPath)} -DestinationPath ${psQuote(destDir)} -Force`,
    ]);
    return;
  }

  try {
    run('unzip', ['-q', zipPath, '-d', destDir]);
  } catch {
    run('tar', ['-xf', zipPath, '-C', destDir]);
  }
}

function firstDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (entries.length === 0) {
    throw new Error(`No directory found inside ${dir}`);
  }

  return entries[0];
}

function findAsset(release, predicate, description) {
  const asset = release.assets?.find(predicate);

  if (!asset) {
    const names = (release.assets || [])
      .map((item) => item.name)
      .sort()
      .join('\n- ');

    throw new Error(`Could not find ${description}. Available assets:\n- ${names}`);
  }

  return asset;
}

function createJre(jdkPath, jreDest) {
  console.log(`Creating JRE with jlink at ${jreDest}...`);

  removeIfExists(jreDest);
  ensureDir(path.dirname(jreDest));

  const jlinkExe = path.join(
    jdkPath,
    'bin',
    process.platform === 'win32' ? 'jlink.exe' : 'jlink'
  );

  if (!fs.existsSync(jlinkExe)) {
    throw new Error(`jlink not found at ${jlinkExe}`);
  }

  run(jlinkExe, [
    '--add-modules',
    'java.base,java.logging,java.xml,java.desktop,java.management,java.naming',
    '--strip-debug',
    '--no-man-pages',
    '--no-header-files',
    '--compress=2',
    '--output',
    jreDest,
  ]);
}

function backupFileIfExists(filePath, backupDir, markerPrefix = '.missing-') {
  const name = path.basename(filePath);
  const backupPath = path.join(backupDir, name);

  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, backupPath);
  } else {
    fs.writeFileSync(path.join(backupDir, `${markerPrefix}${name}`), '');
  }
}

function restoreFileFromBackup(filePath, backupDir, markerPrefix = '.missing-') {
  const name = path.basename(filePath);
  const backupPath = path.join(backupDir, name);
  const missingMarker = path.join(backupDir, `${markerPrefix}${name}`);

  if (fs.existsSync(backupPath)) {
    ensureDir(path.dirname(filePath));
    fs.copyFileSync(backupPath, filePath);
    return;
  }

  if (fs.existsSync(missingMarker) && fs.existsSync(filePath)) {
    fs.rmSync(filePath, { force: true });
  }
}

function validateMsixConfig() {
  if (!fs.existsSync(CONFIG_FILE) || !fs.existsSync(MANIFEST_TEMPLATE)) {
    throw new Error(
      'Missing Microsoft Store bundle config. Run locally and commit the generated config files:\n' +
      'bun x @choochmeque/tauri-windows-bundle@latest init --all-variants\n\n' +
      `Required files:\n- ${path.relative(process.cwd(), CONFIG_FILE)}\n- ${path.relative(process.cwd(), MANIFEST_TEMPLATE)}`
    );
  }
}

function prepareMsixAssets() {
  console.log('--- Regenerating Microsoft Store Assets ---');

  validateMsixConfig();

  const backupDir = fs.mkdtempSync(path.join(TEMP_DIR, 'msix-assets-backup-'));

  const filesToProtect = [
    CONFIG_FILE,
    MANIFEST_TEMPLATE,
    path.resolve('package.json'),
    path.resolve('bun.lock'),
    path.resolve('bun.lockb'),
    path.resolve('package-lock.json'),
    path.resolve('pnpm-lock.yaml'),
    path.resolve('yarn.lock'),
  ];

  for (const file of filesToProtect) {
    backupFileIfExists(file, backupDir);
  }

  const hasCustomWideLogo = fs.existsSync(WIDE_LOGO);

  if (hasCustomWideLogo) {
    fs.copyFileSync(WIDE_LOGO, path.join(backupDir, 'Wide310x150Logo.png'));
    console.log('Custom Wide310x150Logo.png detected. It will be restored after asset generation.');
  }

  try {
    removeIfExists(ASSETS_DIR);
    runTauriWindowsBundle(['init', '--all-variants']);
  } finally {
    for (const file of filesToProtect) {
      restoreFileFromBackup(file, backupDir);
    }
  }

  if (hasCustomWideLogo) {
    ensureDir(ASSETS_DIR);
    fs.copyFileSync(path.join(backupDir, 'Wide310x150Logo.png'), WIDE_LOGO);
    console.log('Custom Wide310x150Logo.png restored over the generated Assets folder.');
  }

  if (!fs.existsSync(ASSETS_DIR)) {
    throw new Error(`MSIX Assets directory was not generated: ${path.relative(process.cwd(), ASSETS_DIR)}`);
  }

  const generatedAssets = fs.readdirSync(ASSETS_DIR, { recursive: true });

  if (generatedAssets.length === 0) {
    throw new Error(`MSIX Assets directory is empty: ${path.relative(process.cwd(), ASSETS_DIR)}`);
  }

  console.log('MSIX Assets available:');

  for (const asset of generatedAssets.sort()) {
    console.log(`- ${path.join(path.relative(process.cwd(), ASSETS_DIR), String(asset))}`);
  }
}

async function downloadStoreDependencies() {
  console.log('--- Downloading Microsoft Store Dependencies ---');

  removeIfExists(STORE_TOOLS_DIR);
  ensureDir(TEMP_DIR);

  const adbZip = path.join(TEMP_DIR, 'adb.zip');
  await downloadFile(
    'https://dl.google.com/android/repository/platform-tools-latest-windows.zip',
    adbZip,
    { expectZip: true }
  );

  extractZip(adbZip, path.join(STORE_TOOLS_DIR, 'adb'));

  const scrcpyRelease = await fetchLatestGithubRelease('Genymobile/scrcpy');
  const scrcpyAsset = findAsset(
    scrcpyRelease,
    (asset) => asset.name.startsWith('scrcpy-win64-') && asset.name.endsWith('.zip'),
    'scrcpy win64 zip asset'
  );

  const scrcpyZip = path.join(TEMP_DIR, 'scrcpy.zip');
  await downloadFile(scrcpyAsset.browser_download_url, scrcpyZip, { expectZip: true });

  const scrcpyExtractDir = path.join(TEMP_DIR, 'scrcpy_ext');
  extractZip(scrcpyZip, scrcpyExtractDir);

  const scrcpyDirName = firstDirectory(scrcpyExtractDir);
  const scrcpyDest = path.join(STORE_TOOLS_DIR, 'scrcpy');

  removeIfExists(scrcpyDest);
  fs.renameSync(path.join(scrcpyExtractDir, scrcpyDirName), scrcpyDest);

  const bundletoolRelease = await fetchLatestGithubRelease('google/bundletool');
  const bundletoolAsset = findAsset(
    bundletoolRelease,
    (asset) => asset.name.startsWith('bundletool-all-') && asset.name.endsWith('.jar'),
    'bundletool-all jar asset'
  );

  const bundletoolDir = path.join(STORE_TOOLS_DIR, 'bundletool');
  ensureDir(bundletoolDir);

  await downloadFile(
    bundletoolAsset.browser_download_url,
    path.join(bundletoolDir, 'bundletool-all.jar')
  );

  const javaData = await fetchJson(
    'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse',
    'Temurin JDK 21 metadata'
  );

  const jdkUrl = javaData?.[0]?.binary?.package?.link;

  if (!jdkUrl) {
    throw new Error('Could not resolve Temurin JDK 21 download URL from Adoptium API response.');
  }

  const jdkZip = path.join(TEMP_DIR, 'jdk.zip');
  await downloadFile(jdkUrl, jdkZip, { expectZip: true });

  const jdkExtractDir = path.join(TEMP_DIR, 'jdk_ext');
  extractZip(jdkZip, jdkExtractDir);

  const jdkDirName = firstDirectory(jdkExtractDir);
  const jdkPath = path.join(jdkExtractDir, jdkDirName);

  createJre(jdkPath, path.join(bundletoolDir, 'java'));

  console.log('All Microsoft Store dependencies downloaded successfully.');
}

function buildMicrosoftStoreBundle() {
  console.log('--- Running Microsoft Store Build ---');

  runTauriWindowsBundle(['build', '--arch', 'x64,arm64', '--runner', 'bun', '--verbose'], {
    env: {
      ...process.env,
      ADB_APP_STORE_BUILD: '1',
    },
  });
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('scripts/store-build.mjs must run on Windows because it downloads and packages Windows Store dependencies.');
  }

  try {
    ensureDir(TEMP_DIR);

    prepareMsixAssets();
    await downloadStoreDependencies();

    removeIfExists(TEMP_DIR);

    const originalTauriConf = fs.readFileSync(TAURI_CONF_PATH, 'utf8');
    try {
      console.log('--- Modifying tauri.conf.json ---');
      const tauriConf = JSON.parse(originalTauriConf);
      if (!tauriConf.bundle) tauriConf.bundle = {};
      if (!tauriConf.bundle.resources) tauriConf.bundle.resources = {};
      if (Array.isArray(tauriConf.bundle.resources)) {
        tauriConf.bundle.resources.push('store_tools/**/*');
      } else {
        tauriConf.bundle.resources['store_tools/**/*'] = 'store_tools';
      }
      
      if (!tauriConf.plugins) tauriConf.plugins = {};
      tauriConf.plugins.updater = null;

      fs.writeFileSync(TAURI_CONF_PATH, JSON.stringify(tauriConf, null, 2));

      buildMicrosoftStoreBundle();
    } finally {
      console.log('--- Restoring tauri.conf.json ---');
      fs.writeFileSync(TAURI_CONF_PATH, originalTauriConf);
    }
  } finally {
    if (fs.existsSync(STORE_TOOLS_DIR)) {
      console.log('--- Cleaning up store_tools ---');
      fs.rmSync(STORE_TOOLS_DIR, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});