import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const errors = [];

function readJson(relativePath) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`Missing file: ${relativePath}`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${relativePath}: ${error.message}`);
    return null;
  }
}

function requireFile(relativePath) {
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    errors.push(`Missing manifest-referenced file: ${relativePath}`);
  }
}

const manifestPath = process.argv[3] || 'manifest.json';
const manifest = readJson(manifestPath);

if (manifest) {
  if (manifest.manifest_version !== 3) {
    errors.push(`${manifestPath} must use Manifest V3`);
  }

  if (manifest.browser_specific_settings?.gecko) {
    const gecko = manifest.browser_specific_settings.gecko;
    if (typeof gecko.id !== 'string' || !gecko.id.includes('@')) {
      errors.push(`${manifestPath} must define a stable Firefox Gecko ID`);
    }
    const disclosed = gecko.data_collection_permissions?.required || [];
    for (const category of ['websiteActivity', 'websiteContent']) {
      if (!disclosed.includes(category)) {
        errors.push(`${manifestPath} must disclose local ${category} processing`);
      }
    }
  }

  if (manifest.options_page) {
    requireFile(manifest.options_page);
  }
  if (manifest.options_ui?.page) {
    requireFile(manifest.options_ui.page);
  }

  const backgroundScripts = manifest.background?.scripts || [];
  const backgroundEntrypoint = manifest.background?.service_worker ||
    backgroundScripts[0];
  if (backgroundEntrypoint) {
    requireFile(backgroundEntrypoint);
    for (const path of backgroundScripts) {
      requireFile(path);
    }
    for (const path of [
      'background/scan_payload.js',
      'background/browser_context.js',
      'background/pairing_store.js',
      'background/local_connection.js',
    ]) {
      requireFile(path);
    }
  } else {
    errors.push(`${manifestPath} must define a background entrypoint`);
  }

  for (const path of Object.values(manifest.icons || {})) {
    requireFile(path);
  }

  for (const definition of manifest.content_scripts || []) {
    for (const path of definition.js || []) {
      requireFile(path);

      const absolutePath = resolve(root, path);
      if (existsSync(absolutePath)) {
        const source = readFileSync(absolutePath, 'utf8');
        const topLevelModuleSyntax = /(^|\n)\s*(?:export\s+|import\s+(?!\())/m;
        if (topLevelModuleSyntax.test(source)) {
          errors.push(`${path} is a classic content script and cannot contain top-level ESM syntax`);
        }
      }
    }
  }

  if (manifest.default_locale) {
    const defaultMessages = `_locales/${manifest.default_locale}/messages.json`;
    const messages = readJson(defaultMessages);
    if (messages) {
      for (const token of [manifest.name, manifest.description]) {
        const match = typeof token === 'string' && token.match(/^__MSG_(.+)__$/);
        if (match && !messages[match[1]]) {
          errors.push(`${defaultMessages} is missing message key ${match[1]}`);
        }
      }
    }
  }
}

for (const locale of ['id', 'en']) {
  readJson(`_locales/${locale}/messages.json`);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Extension manifest ${manifestPath} verified at ${root}`);
