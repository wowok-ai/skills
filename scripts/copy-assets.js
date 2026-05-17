const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DOCS = path.resolve(ROOT, '..', 'docs');

let hasError = false;

function copyDirIfExists(src, dest, label) {
  if (fs.existsSync(src)) {
    console.log(`[copy] ${label}: ${src} -> ${dest}`);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    const count = fs.readdirSync(dest, { recursive: true }).filter(f => f.endsWith('.md')).length;
    console.log(`[ok]   ${label}: ${count} markdown files copied`);
    return true;
  }
  return false;
}

function checkDirExists(dir, label) {
  if (fs.existsSync(dir)) {
    const count = fs.readdirSync(dir, { recursive: true }).filter(f => f.endsWith('.md')).length;
    console.log(`[ok]   ${label}: already exists (${count} markdown files)`);
    return true;
  }
  return false;
}

// --- Examples ---
const examplesSrc = path.join(DOCS, 'examples');
const examplesDest = path.join(ROOT, 'examples');

const examplesFromDocs = copyDirIfExists(examplesSrc, examplesDest, 'examples');
if (!examplesFromDocs) {
  const examplesExist = checkDirExists(examplesDest, 'examples');
  if (!examplesExist) {
    console.error('[ERR]  examples: source not found and dest does not exist. Run skill-deploy.sh or ensure docs/ is at ../docs');
    hasError = true;
  }
}

// --- Schemas ---
const schemasSrc = path.join(DOCS, 'skills');
const schemasDest = path.join(ROOT, 'schemas');

const schemasFromDocs = copyDirIfExists(schemasSrc, schemasDest, 'schemas');
if (!schemasFromDocs) {
  const schemasExist = checkDirExists(schemasDest, 'schemas');
  if (!schemasExist) {
    console.error('[ERR]  schemas: source not found and dest does not exist. Run skill-deploy.sh or ensure docs/ is at ../docs');
    hasError = true;
  }
}

// Exclude WOWOK.md from schemas (covered by skills framework)
const wowokPath = path.join(schemasDest, 'WOWOK.md');
if (fs.existsSync(wowokPath)) {
  fs.unlinkSync(wowokPath);
  console.log('[ok]   schemas: removed WOWOK.md (covered by skills)');
}

if (hasError) {
  console.error('\n[FAIL] Asset copy incomplete. Build may produce a package missing examples or schemas.');
  process.exit(1);
}

console.log('\n[DONE] All assets verified.');