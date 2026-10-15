import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Every name upstream's entry exports, types included, against the entry of each adapter
// An adapter is not started, or started with the list of what it still lacks

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const NOT_STARTED: readonly string[] = [];

// What a started entry does not carry yet, each name with what stands in the way. Only shrinks
const NOT_YET: Record<
  'react' | 'vue' | 'svelte' | 'solid' | 'angular',
  Record<string, string>
> = {
  react: {},
  vue: {},
  svelte: {},
  solid: {},
  angular: {},
};

type IAdapter = keyof typeof NOT_YET;

function programOver(entries: string[]): ts.Program {
  const config = ts.readConfigFile(
    join(ROOT, 'tsconfig.json'),
    ts.sys.readFile,
  );
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  return ts.createProgram(entries, {
    ...parsed.options,
    noEmit: true,
    composite: false,
    incremental: false,
    declaration: false,
    skipLibCheck: true,
  });
}

function exportNames(program: ts.Program, entry: string): Set<string> {
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  if (source === undefined) throw new Error(`no source file ${entry}`);
  const symbol = checker.getSymbolAtLocation(source);
  if (symbol === undefined) throw new Error(`${entry} exports nothing`);
  return new Set(checker.getExportsOfModule(symbol).map(item => item.name));
}

const UPSTREAM_ENTRY = join(
  ROOT,
  'node_modules/react-native-reanimated/lib/typescript/index.d.ts',
);

function entryOf(adapter: string): string {
  return join(HERE, adapter, 'index.ts');
}

const adapters = Object.keys(NOT_YET) as IAdapter[];
const started = adapters.filter(adapter => existsSync(entryOf(adapter)));
const program = programOver([UPSTREAM_ENTRY, ...started.map(entryOf)]);
const upstream = exportNames(program, UPSTREAM_ENTRY);

describe('the entry of an adapter against upstream', () => {
  it.each(adapters)('the %s entry exists', adapter => {
    expect(existsSync(entryOf(adapter))).toBe(true);
  });

  it.each(started)(
    'the %s entry carries every export of upstream but the ones listed as not yet',
    adapter => {
      const ours = exportNames(program, entryOf(adapter));
      const missing = [...upstream]
        .filter(name => !ours.has(name) && !(name in NOT_YET[adapter]))
        .sort();

      expect(missing).toEqual([]);
    },
  );

  it.each(started)(
    'the %s list of not yet names only what it lacks',
    adapter => {
      const ours = exportNames(program, entryOf(adapter));
      const carried = Object.keys(NOT_YET[adapter]).filter(name =>
        ours.has(name),
      );

      expect(carried).toEqual([]);
    },
  );

  it.each(NOT_STARTED)(
    'the %s entry is not there yet, as this list says',
    adapter => {
      expect(existsSync(entryOf(adapter))).toBe(false);
    },
  );
});
