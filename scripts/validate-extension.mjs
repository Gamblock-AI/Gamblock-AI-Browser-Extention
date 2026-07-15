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

const manifest = readJson('manifest.json');

if (manifest) {
  if (manifest.manifest_version !== 3) {
    errors.push('manifest.json must use Manifest V3');
  }

  if (manifest.options_page) {
    requireFile(manifest.options_page);
  }

  if (manifest.background?.service_worker) {
    requireFile(manifest.background.service_worker);
  } else {
    errors.push('manifest.json must define background.service_worker');
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

console.log(`Extension manifest verified at ${root}`);
