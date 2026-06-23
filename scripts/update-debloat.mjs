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

async function main() {
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

  const outPath = path.resolve(__dirname, '../src/assets/debloat-data.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(map));
  console.log(`Successfully compiled debloat list to src/assets/debloat-data.json`);
}

main().catch((err) => {
  console.error("Failed to update debloat lists:", err);
  process.exit(1);
});
