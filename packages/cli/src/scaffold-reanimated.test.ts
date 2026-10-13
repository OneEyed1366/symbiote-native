import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { scaffoldApp, type IScaffoldOptions } from './generate.js';

const WORKLETS_PLUGIN = 'react-native-worklets/plugin';

const FRAMEWORKS = [
  ['react', undefined],
  ['vue', 'sfc'],
  ['vue', 'tsx'],
  ['solid', undefined],
  ['svelte', undefined],
  ['angular', undefined],
] as const satisfies ReadonlyArray<
  readonly [IScaffoldOptions['framework'], IScaffoldOptions['vueFlavor']]
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('scaffoldApp reanimated option', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function scaffold(
    framework: IScaffoldOptions['framework'],
    vueFlavor: IScaffoldOptions['vueFlavor'],
    hasReanimated: boolean,
  ): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-reanimated-'),
    );
    tmpDirs.push(root);
    scaffoldApp({
      appName: root,
      framework,
      vueFlavor,
      hasTypescript: true,
      bundleId: 'com.example.app',
      hasExpoModules: false,
      hasNavigation: false,
      hasTesting: false,
      hasSplashScreen: false,
      hasSlider: false,
      hasReanimated,
      styling: 'css',
      packageManager: 'npm',
    });
    return root;
  }

  function dependenciesOf(root: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    const dependencies = isRecord(parsed) ? parsed.dependencies : undefined;
    return isRecord(dependencies) ? dependencies : {};
  }

  function babelConfigOf(root: string): string {
    return fs.readFileSync(path.join(root, 'babel.config.js'), 'utf8');
  }

  describe.each(FRAMEWORKS)('%s %s', (framework, vueFlavor) => {
    it('declares the package and the two native peers at the pinned versions', () => {
      const root = scaffold(framework, vueFlavor, true);

      expect(dependenciesOf(root)).toMatchObject({
        '@symbiote-native/reanimated': 'latest',
        'react-native-reanimated': '4.7.1',
        'react-native-worklets': '0.13.0',
      });
    });

    it('puts the worklets plugin last in the babel config', () => {
      const root = scaffold(framework, vueFlavor, true);

      expect(babelConfigOf(root)).toMatch(
        new RegExp(`'${WORKLETS_PLUGIN}',?\\s*\\],?\\s*\\};`),
      );
    });

    it('leaves a babel config that is still a valid script', () => {
      const root = scaffold(framework, vueFlavor, true);

      expect(() => new vm.Script(babelConfigOf(root))).not.toThrow();
    });

    it('adds neither the dependencies nor the plugin when the option is off', () => {
      const root = scaffold(framework, vueFlavor, false);

      expect(dependenciesOf(root)).not.toHaveProperty('react-native-worklets');
      expect(babelConfigOf(root)).not.toContain(WORKLETS_PLUGIN);
    });
  });
});
