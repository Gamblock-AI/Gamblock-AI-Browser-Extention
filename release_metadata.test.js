const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const extensionVersion = require('./manifest.json').version;

const repoRoot = resolve(__dirname);
const metadataScript = resolve(repoRoot, 'scripts/create-release-metadata.mjs');

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

describe('release metadata', () => {
  it('records package facts and deterministic archive hashes', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'gamblock-extension-'));
    try {
      const chromiumData = Buffer.from('chromium fixture');
      const firefoxData = Buffer.from('firefox fixture');
      const chromium = join(
        temporaryRoot,
        `gamblock-ai-extension-chromium-v${extensionVersion}.zip`,
      );
      const firefox = join(
        temporaryRoot,
        `gamblock-ai-extension-firefox-v${extensionVersion}.zip`,
      );
      const output = join(temporaryRoot, 'compatibility.json');
      writeFileSync(chromium, chromiumData);
      writeFileSync(firefox, firefoxData);

      execFileSync(process.execPath, [
        metadataScript,
        '--version', extensionVersion,
        '--commit', 'test-commit',
        '--chromium', chromium,
        '--firefox', firefox,
        '--output', output,
      ], { cwd: repoRoot });

      expect(existsSync(output)).toBe(true);
      const metadata = JSON.parse(readFileSync(output, 'utf8'));
      expect(metadata).toMatchObject({
        schema_version: 1,
        release_tag: `v${extensionVersion}`,
        extension_version: extensionVersion,
        source_commit: 'test-commit',
        manifest_version: 3,
        websocket_protocol: 2,
      });
      expect(metadata.packages).toEqual([
        expect.objectContaining({
          family: 'chromium',
          manifest: 'manifest.json',
          filename: `gamblock-ai-extension-chromium-v${extensionVersion}.zip`,
          sha256: sha256(chromiumData),
        }),
        expect.objectContaining({
          family: 'firefox',
          manifest: 'manifest.firefox.json',
          filename: `gamblock-ai-extension-firefox-v${extensionVersion}.zip`,
          sha256: sha256(firefoxData),
        }),
      ]);
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects a release version that differs from either manifest', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'gamblock-extension-'));
    try {
      const chromium = join(
        temporaryRoot,
        'gamblock-ai-extension-chromium-v9.9.9.zip',
      );
      const firefox = join(
        temporaryRoot,
        'gamblock-ai-extension-firefox-v9.9.9.zip',
      );
      const output = join(temporaryRoot, 'compatibility.json');
      writeFileSync(chromium, 'chromium fixture');
      writeFileSync(firefox, 'firefox fixture');

      expect(() => execFileSync(process.execPath, [
        metadataScript,
        '--version', '9.9.9',
        '--commit', 'test-commit',
        '--chromium', chromium,
        '--firefox', firefox,
        '--output', output,
      ], { cwd: repoRoot })).toThrow();
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });
});
