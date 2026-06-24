import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEBLOAT_LISTS = [
  "aosp.json",
  "carrier.json",
  "google.json",
  "misc.json",
  "oem.json",
];

const BASE_URL = "https://raw.githubusercontent.com/MuntashirAkon/android-debloat-list/master/";
const REMOVAL_MAP = {
  "delete": 0,
  "replace": 1,
  "caution": 2,
  "unsafe": 3
};

const CSV_URL = "http://storage.googleapis.com/play_public/supported_devices.csv";

async function main() {
  // --- 1. Debloat Data ---
  const debloatPath = path.resolve(__dirname, '../src/assets/debloat-data.json');
  if (!fs.existsSync(debloatPath)) {
    console.log("Downloading debloat lists...");
    const map = {};

    for (const file of DEBLOAT_LISTS) {
      const res = await fetch(`${BASE_URL}${file}`);
      if (!res.ok) throw new Error(`Failed to fetch ${file}: ${res.statusText}`);
      const items = await res.json();
      for (const item of items) {
        if (!item.id || !item.removal) continue;
        const removalLevel = REMOVAL_MAP[item.removal];
        if (removalLevel === undefined) continue;
        
        const tuple = [removalLevel, item.description || ""];
        if (item.warning) {
          tuple.push(item.warning);
        }
        map[item.id] = tuple;
      }
    }

    fs.mkdirSync(path.dirname(debloatPath), { recursive: true });
    fs.writeFileSync(debloatPath, JSON.stringify(map));
    console.log(`Successfully compiled debloat list to src/assets/debloat-data.json`);
  } else {
    console.log("debloat-data.json already exists. Skipping download.");
  }

  // --- 2. Device DB Data ---
  const deviceDbPath = path.resolve(__dirname, '../src/assets/device-db.json');
  if (!fs.existsSync(deviceDbPath)) {
    console.log("Downloading supported devices list...");
    const res = await fetch(CSV_URL);
    if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.statusText}`);
    
    const buffer = await res.arrayBuffer();
    // The CSV from Google is UTF-16LE encoded.
    const text = new TextDecoder('utf-16le').decode(buffer);
    
    const lines = text.split('\n');
    const deviceMap = {};
    
    // Skip header (i=0)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = [];
      let current = '';
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());
      
      if (parts.length < 4) continue;
      
      let brand = parts[0];
      let marketingName = parts[1];
      let model = parts[3];
      
      if (!brand || !model || !marketingName) continue;
      
      if (!deviceMap[brand]) {
        deviceMap[brand] = {};
      }
      
      // Store Model -> Marketing Name
      deviceMap[brand][model] = marketingName;
    }
    
    fs.mkdirSync(path.dirname(deviceDbPath), { recursive: true });
    fs.writeFileSync(deviceDbPath, JSON.stringify(deviceMap));
    console.log(`Successfully compiled device db to src/assets/device-db.json`);
  } else {
    console.log("device-db.json already exists. Skipping download.");
  }
}

main().catch((err) => {
  console.error("Failed to update db:", err);
  process.exit(1);
});
