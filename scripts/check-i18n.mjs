import fs from 'node:fs';
import path from 'node:path';

function i18nCheck() {
  try {
    const messagesDir = path.resolve(process.cwd(), 'messages');
    if (!fs.existsSync(messagesDir)) return;
    
    const files = fs.readdirSync(messagesDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) return;
    
    const languages = {};
    const allKeys = new Set();
    
    // 1. Cargar todas las claves de todos los idiomas
    for (const file of files) {
      const lang = file.replace('.json', '');
      const content = JSON.parse(fs.readFileSync(path.join(messagesDir, file), 'utf-8'));
      languages[lang] = Object.keys(content);
      for (const key of languages[lang]) {
        allKeys.add(key);
      }
    }
    
    // 2. Comprobar si falta alguna clave en algún idioma
    let missingFound = false;
    for (const lang of Object.keys(languages)) {
      const langKeys = new Set(languages[lang]);
      const missing = Array.from(allKeys).filter(k => !langKeys.has(k));
      if (missing.length > 0) {
        console.warn(`\n\x1b[31m[i18n-check] Missing translations in ${lang}.json:\x1b[0m`);
        missing.forEach(k => console.warn(`  - ${k}`));
        missingFound = true;
      }
    }
    if (missingFound) console.warn('\n');
    
    // 3. Comprobar qué claves de idioma no se usan en el código
    const baseKeys = Array.from(allKeys);
    const usedKeys = new Set();
    const srcPath = path.resolve(process.cwd(), 'src');
    const tauriPath = path.resolve(process.cwd(), 'src-tauri', 'src');
    
    function scanDir(dir) {
      if (!fs.existsSync(dir)) return;
      const dirFiles = fs.readdirSync(dir);
      for (const file of dirFiles) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
          scanDir(fullPath);
        } else if (fullPath.endsWith('.svelte') || fullPath.endsWith('.ts') || fullPath.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Llamadas estáticas
          const matches = content.matchAll(/m\.([a-zA-Z0-9_]+)/g);
          for (const match of matches) {
            usedKeys.add(match[1]);
          }
          // Llamadas dinámicas
          const dynamicMatches = content.matchAll(/`([a-zA-Z0-9_]+)\$\{/g);
          for (const match of dynamicMatches) {
            const prefix = match[1];
            for (const key of baseKeys) {
              if (key.startsWith(prefix)) {
                usedKeys.add(key);
              }
            }
          }
        } else if (fullPath.endsWith('.rs')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const matches = content.matchAll(/([a-zA-Z0-9_]+)/g);
          for (const match of matches) {
            const word = match[1];
            if (allKeys.has(word)) {
              usedKeys.add(word);
            }
          }
        }
      }
    }
    
    scanDir(srcPath);
    scanDir(tauriPath);
    
    const unused = baseKeys.filter(k => !usedKeys.has(k));
    if (unused.length > 0) {
      console.warn('\n\x1b[33m[i18n-check] Unused translation keys detected:\x1b[0m');
      unused.forEach(k => console.warn(`  - ${k}`));
      console.warn('\n');
    }
  } catch (e) {
    console.error('[i18n-check] Error checking translation keys', e);
  }
}

i18nCheck();
