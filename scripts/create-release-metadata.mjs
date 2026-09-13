#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumentsList = process.argv.slice(2);

function usage(message) {
  if (message) console.error(message);
  console.error(
    'Usage: create-release-metadata.mjs --version <MAJOR.MINOR.PATCH> ' +
      '--commit <sha> --chromium <zip> --firefox <zip> --output <json>',
  );
  process.exit(2);
}

function option(name) {
  const index = argumentsList.indexOf(name);
  if (index === -1 || !argumentsList[index + 1]) usage(`Missing option: ${name}`);
  return argumentsList[index + 1];
}

const version = option('--version');
const commit = option('--commit');
const chromiumArchive = resolve(repoRoot, option('--chromium'));
const firefoxArchive = resolve(repoRoot, option('--firefox'));
const output = resolve(repoRoot, option('--output'));

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  usage(`Version must be MAJOR.MINOR.PATCH: ${version}`);
}
if (!commit.trim()) usage('Commit must not be empty');

function readManifest(relativePath) {
  const path = resolve(repoRoot, relativePath);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read ${relativePath}: ${error.message}`);
  }
}

function archiveSha256(path, expectedFilename) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Package not found: ${path}`);
  }
  const filename = basename(path);
  if (filename !== expectedFilename) {
    throw new Error(`Unexpected package name ${filename}; expected ${expectedFilename}`);
  }
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

const chromiumManifest = readManifest('manifest.json');
const firefoxManifest = readManifest('manifest.firefox.json');
for (const [family, manifest] of [
  ['chromium', chromiumManifest],
  ['firefox', firefoxManifest],
]) {
  if (manifest.manifest_version !== 3) {
    throw new Error(`${family} manifest must use Manifest V3`);
  }
  if (manifest.version !== version) {
    throw new Error(
      `${family} manifest version ${manifest.version} does not match ${version}`,
    );
  }
}

const packages = [
  {
    family: 'chromium',
    manifest: 'manifest.json',
    filename: `gamblock-ai-extension-chromium-v${version}.zip`,
    sha256: archiveSha256(
      chromiumArchive,
      `gamblock-ai-extension-chromium-v${version}.zip`,
    ),
  },
  {
    family: 'firefox',
    manifest: 'manifest.firefox.json',
    filename: `gamblock-ai-extension-firefox-v${version}.zip`,
    sha256: archiveSha256(
      firefoxArchive,
      `gamblock-ai-extension-firefox-v${version}.zip`,
    ),
  },
];

const metadata = {
  schema_version: 1,
  release_tag: `v${version}`,
  extension_version: version,
  source_commit: commit,
  manifest_version: 3,
  websocket_protocol: 2,
  packages,
};

writeFileSync(output, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Created release metadata: ${output}`);
