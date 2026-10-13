import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addWorkletsPlugin,
  applyReanimatedBabelPlugin,
} from './apply-reanimated-babel-plugin.js';

const PLUGIN = "'react-native-worklets/plugin'";
const TEMPLATES_JS = path.join(__dirname, '..', '..', 'templates', 'js');

function pluginsOf(source: string): string {
  const start = source.indexOf('plugins: [');
  return source.slice(start, source.indexOf('],', start) + 1);
}

describe('applyReanimatedBabelPlugin', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs.splice(0))
      fs.rmSync(dir, { recursive: true, force: true });
  });

  function appWith(configSource: string | undefined): string {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), 'symbiote-cli-worklets-'),
    );
    tmpDirs.push(root);
    if (configSource !== undefined)
      fs.writeFileSync(path.join(root, 'babel.config.js'), configSource);
    return root;
  }

  it('writes the plugin into the babel config of the app and says it is listed', () => {
    const root = appWith('module.exports = {\n  plugins: [first],\n};\n');

    const isListed = applyReanimatedBabelPlugin(root);

    expect(isListed).toBe(true);
    expect(
      fs.readFileSync(path.join(root, 'babel.config.js'), 'utf8'),
    ).toContain(`[first, ${PLUGIN}]`);
  });

  it('says the plugin is not listed when the app has no babel config', () => {
    expect(applyReanimatedBabelPlugin(appWith(undefined))).toBe(false);
  });

  it('says the plugin is not listed and leaves the file alone when it has no plugins list', () => {
    const source = 'module.exports = { presets: [] };\n';
    const root = appWith(source);

    expect(applyReanimatedBabelPlugin(root)).toBe(false);
    expect(fs.readFileSync(path.join(root, 'babel.config.js'), 'utf8')).toBe(
      source,
    );
  });
});

describe('addWorkletsPlugin', () => {
  it('appends the plugin to a one-line list, after the existing entries', () => {
    const source = 'module.exports = {\n  plugins: [inlineDebugFlag],\n};\n';

    expect(addWorkletsPlugin(source)).toBe(
      `module.exports = {\n  plugins: [inlineDebugFlag, ${PLUGIN}],\n};\n`,
    );
  });

  it('appends the plugin as the last line of a multi-line list, indented like the others', () => {
    const source =
      'module.exports = {\n  plugins: [\n    first,\n    second,\n  ],\n};\n';

    expect(addWorkletsPlugin(source)).toBe(
      `module.exports = {\n  plugins: [\n    first,\n    second,\n    ${PLUGIN},\n  ],\n};\n`,
    );
  });

  it('leaves a config that already lists the plugin untouched', () => {
    const source = `module.exports = {\n  plugins: [first, ${PLUGIN}],\n};\n`;

    expect(addWorkletsPlugin(source)).toBe(source);
  });

  it('gives up on a config with no plugins list, so the caller can tell the developer', () => {
    expect(
      addWorkletsPlugin('module.exports = { presets: [] };\n'),
    ).toBeUndefined();
  });

  it('is not fooled by a bracket inside a string or a comment of the list', () => {
    const source =
      "module.exports = {\n  plugins: [\n    // ] not the end\n    require('a[b]'),\n  ],\n};\n";

    const result = addWorkletsPlugin(source);

    expect(result).toBe(
      `module.exports = {\n  plugins: [\n    // ] not the end\n    require('a[b]'),\n    ${PLUGIN},\n  ],\n};\n`,
    );
  });

  describe.each(['react', 'vue-tsx', 'vue-sfc', 'solid', 'svelte', 'angular'])(
    'the %s template config',
    template => {
      const original = fs.readFileSync(
        path.join(TEMPLATES_JS, template, 'babel.config.js'),
        'utf8',
      );

      it('gets the plugin as the last entry of its plugins list', () => {
        const result = addWorkletsPlugin(original);

        expect(result && pluginsOf(result)).toMatch(
          new RegExp(`${PLUGIN.replace(/\//g, '\\/')},?\\s*\\]$`),
        );
      });

      it('is still a valid script after the edit', () => {
        const result = addWorkletsPlugin(original);

        expect(() => new vm.Script(result ?? '')).not.toThrow();
      });
    },
  );
});
