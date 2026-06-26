import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const STORE_TOOLS_DIR = path.resolve('src-tauri', 'store_tools');
const TEMP_DIR = path.join(STORE_TOOLS_DIR, 'temp');

async function fetchLatestGithubRelease(repo) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'ADB-App-Builder' }
  });
  if (!res.ok) throw new Error(`Failed to fetch ${repo} release: ${res.statusText}`);
  return await res.json();
}

async function downloadFile(url, dest) {
  console.log(`Downloading ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}`);
  const fileStream = fs.createWriteStream(dest, { flags: 'wx' });
  await finished(Readable.fromWeb(res.body).pipe(fileStream));
}

function extractZip(zipPath, destDir) {
  console.log(`Extracting ${zipPath} to ${destDir}...`);
  fs.mkdirSync(destDir, { recursive: true });
  execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: 'inherit' });
}

async function main() {
  if (fs.existsSync(STORE_TOOLS_DIR)) {
    fs.rmSync(STORE_TOOLS_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  try {
    // 1. ADB
    const adbZip = path.join(TEMP_DIR, 'adb.zip');
    await downloadFile('https://dl.google.com/android/repository/platform-tools-latest-windows.zip', adbZip);
    extractZip(adbZip, path.join(STORE_TOOLS_DIR, 'adb'));

    // 2. Scrcpy
    const scrcpyRelease = await fetchLatestGithubRelease('Genymobile/scrcpy');
    const scrcpyAsset = scrcpyRelease.assets.find(a => a.name.startsWith('scrcpy-win64-') && a.name.endsWith('.zip'));
    if (!scrcpyAsset) throw new Error('Could not find scrcpy win64 asset');
    const scrcpyZip = path.join(TEMP_DIR, 'scrcpy.zip');
    await downloadFile(scrcpyAsset.browser_download_url, scrcpyZip);
    const scrcpyExtractDir = path.join(TEMP_DIR, 'scrcpy_ext');
    extractZip(scrcpyZip, scrcpyExtractDir);
    const scrcpyDirName = fs.readdirSync(scrcpyExtractDir)[0];
    fs.renameSync(path.join(scrcpyExtractDir, scrcpyDirName), path.join(STORE_TOOLS_DIR, 'scrcpy'));

    // 3. Bundletool
    const bundletoolRelease = await fetchLatestGithubRelease('google/bundletool');
    const bundletoolAsset = bundletoolRelease.assets.find(a => a.name.startsWith('bundletool-all-') && a.name.endsWith('.jar'));
    const bundletoolDir = path.join(STORE_TOOLS_DIR, 'bundletool');
    fs.mkdirSync(bundletoolDir, { recursive: true });
    await downloadFile(bundletoolAsset.browser_download_url, path.join(bundletoolDir, 'bundletool-all.jar'));

    // 4. Java
    const javaApiUrl = "https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse";
    const javaRes = await fetch(javaApiUrl);
    const javaData = await javaRes.json();
    const jdkUrl = javaData[0].binary.package.link;
    const jdkZip = path.join(TEMP_DIR, 'jdk.zip');
    await downloadFile(jdkUrl, jdkZip);
    const jdkExtractDir = path.join(TEMP_DIR, 'jdk_ext');
    extractZip(jdkZip, jdkExtractDir);
    const jdkDirName = fs.readdirSync(jdkExtractDir)[0];
    const jdkPath = path.join(jdkExtractDir, jdkDirName);

    const jreDest = path.join(bundletoolDir, 'java');
    console.log(`Creating JRE with jlink at ${jreDest}...`);
    const jlinkExe = path.join(jdkPath, 'bin', 'jlink.exe');
    execSync(`"${jlinkExe}" --add-modules java.base,java.logging,java.xml,java.desktop,java.management,java.naming --strip-debug --no-man-pages --no-header-files --compress=2 --output "${jreDest}"`, { stdio: 'inherit' });

    console.log('All dependencies downloaded successfully.');
  } finally {
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
