import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyBootsplashLogo } from './apply-bootsplash-logo.js';

describe('applyBootsplashLogo', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function setupFakeTemplatesRoot(): string {
    const templatesRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-bootsplash-logo-'),
    );
    tmpDirs.push(templatesRoot);
    const vueLogoPath = path.join(
      templatesRoot,
      'native',
      'bootsplash-logo',
      'vue',
      'android',
      'app',
      'src',
      'main',
      'res',
      'drawable-mdpi',
    );
    fs.mkdirSync(vueLogoPath, { recursive: true });
    fs.writeFileSync(
      path.join(vueLogoPath, 'bootsplash_logo.png'),
      'vue-bytes',
    );
    return templatesRoot;
  }

  // why: the react-default logo already ships as part of the base `native/` template — a react
  // scaffold must not gain a second, redundant overlay directory.
  it('is a no-op for react — no overlay directory exists for it', () => {
    const templatesRoot = setupFakeTemplatesRoot();
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-bootsplash-app-'),
    );
    tmpDirs.push(root);
    applyBootsplashLogo(root, templatesRoot, 'react');
    expect(fs.readdirSync(root)).toHaveLength(0);
  });

  it('overwrites the base logo with the framework-specific one', () => {
    const templatesRoot = setupFakeTemplatesRoot();
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-bootsplash-app-'),
    );
    tmpDirs.push(root);
    const logoPath = path.join(
      root,
      'android',
      'app',
      'src',
      'main',
      'res',
      'drawable-mdpi',
      'bootsplash_logo.png',
    );
    fs.mkdirSync(path.dirname(logoPath), { recursive: true });
    fs.writeFileSync(logoPath, 'react-bytes');

    applyBootsplashLogo(root, templatesRoot, 'vue');

    expect(fs.readFileSync(logoPath, 'utf8')).toBe('vue-bytes');
  });
});
