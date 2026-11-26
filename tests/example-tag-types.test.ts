import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Native tag types must come from the app config, not from some screen importing the adapter
// With an import as the only source, a screen made of tags alone fails the type check
const EXAMPLES = join(__dirname, '..', 'examples');

// Angular goes first, as its apps also depend on the React adapter and need no entry
const ADAPTERS = ['angular', 'svelte', 'solid', 'vue', 'react'] as const;
type IAdapter = (typeof ADAPTERS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function recordIn(source: unknown, key: string): Record<string, unknown> {
  const value = isRecord(source) ? source[key] : undefined;
  return isRecord(value) ? value : {};
}

function readManifest(example: string): unknown {
  return JSON.parse(
    readFileSync(join(EXAMPLES, example, 'package.json'), 'utf8'),
  );
}

function adapterOf(example: string): IAdapter | undefined {
  const dependencies = recordIn(readManifest(example), 'dependencies');
  return ADAPTERS.find(name => `@symbiote-native/${name}` in dependencies);
}

type ITagTypeSettings = {
  options: Record<string, unknown>;
  vueOptions: Record<string, unknown>;
};

// Only a relative `extends` is followed, as the shared React Native base names no adapter
function settingsOf(file: string): ITagTypeSettings {
  const config: unknown = ts.parseConfigFileTextToJson(
    file,
    readFileSync(file, 'utf8'),
  ).config;
  const parent = isRecord(config) ? config.extends : undefined;
  const base =
    typeof parent === 'string' && parent.startsWith('.')
      ? settingsOf(join(dirname(file), parent))
      : { options: {}, vueOptions: {} };
  return {
    options: { ...base.options, ...recordIn(config, 'compilerOptions') },
    vueOptions: {
      ...base.vueOptions,
      ...recordIn(config, 'vueCompilerOptions'),
    },
  };
}

// The editor reads `tsconfig.json`, and the `typecheck` script may name another file
function configFilesOf(example: string): string[] {
  const script = recordIn(readManifest(example), 'scripts').typecheck;
  const named =
    typeof script === 'string'
      ? /(?:-p|--tsconfig)\s+(\S+)/.exec(script)?.[1]
      : undefined;
  return [...new Set(['tsconfig.json', named ?? 'tsconfig.json'])];
}

function loadsTagTypes(file: string, adapter: IAdapter): boolean {
  const { options, vueOptions } = settingsOf(file);
  const name = `@symbiote-native/${adapter}`;
  if (adapter === 'svelte') {
    return Array.isArray(options.types) && options.types.includes(name);
  }
  return options.jsxImportSource === name || vueOptions.lib === name;
}

const apps = readdirSync(EXAMPLES)
  .filter(name => existsSync(join(EXAMPLES, name, 'package.json')))
  .flatMap(name => {
    const adapter = adapterOf(name);
    const needsEntry = adapter !== undefined && adapter !== 'angular';
    return needsEntry ? [{ name, adapter }] : [];
  });

describe('every example loads the native tag types from its own config', () => {
  it('finds the examples of the four adapters that need an entry', () => {
    expect([...new Set(apps.map(app => app.adapter))].sort()).toEqual([
      'react',
      'solid',
      'svelte',
      'vue',
    ]);
  });

  it.each(apps)('$name ($adapter)', ({ name, adapter }) => {
    const unloaded = configFilesOf(name).filter(
      file => !loadsTagTypes(join(EXAMPLES, name, file), adapter),
    );
    expect(unloaded).toEqual([]);
  });
});
