// Ports a React Native package to Vue SFC: walks it from its entry, writes the port and a ledger
// Usage: node src/port/port-package.ts <package-src-dir> <out-dir>
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Statement } from '@babel/types';
import { babelTypes as t, createFileReader, findEntry, parseFile, resolveModule } from '../source-graph.ts';
import type { IReadFile } from '../source-graph.ts';
import { PORT_STATUS } from './ledger.ts';
import type { IPortEntry } from './ledger.ts';
import { BRIDGE_FILE, portFile } from './vue-sfc/port-file.ts';
import type { IPortedFile } from './vue-sfc/port-file.ts';
import { TYPE_ONLY } from './vue-sfc/sfc-imports.ts';
import type { IPackageState } from './vue-sfc/sfc-imports.ts';

const LEDGER_FILE = 'ledger.json';
const ADAPTER_MODULE = '@symbiote-native/vue';
const PLATFORM_SUFFIX = /\.native(?=\.[jt]sx?$)/;
const SOURCE_EXTENSION = /\.[jt]sx?$/;
const BRIDGE_SOURCE = fileURLToPath(new URL('./vue-sfc/context-bridge.ts', import.meta.url));

export type IPortReport = { outDir: string; files: string[]; entries: IPortEntry[] };

function sourceOf(statement: Statement): string | null {
  const hasSource =
    t.isImportDeclaration(statement) ||
    t.isExportAllDeclaration(statement) ||
    t.isExportNamedDeclaration(statement);
  return hasSource && statement.source ? statement.source.value : null;
}

// Dependencies come first, so a file is ported after every file it re-exports from
function reachableFiles(entry: string, readFile: IReadFile): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const statement of readFile(file).program.body) {
      const source = sourceOf(statement);
      const target = source === null ? null : resolveModule(file, source);
      if (target !== null) visit(target);
    }
    order.push(file);
  };
  visit(entry);
  return order;
}

// The names the adapter's barrel exports by name: a `react-native` value import retargets to them
function adapterExports(): Set<string> {
  const entry = createRequire(import.meta.url).resolve(ADAPTER_MODULE);
  const names = new Set<string>();
  for (const statement of parseFile(entry).program.body) {
    if (!t.isExportNamedDeclaration(statement) || statement.exportKind === TYPE_ONLY) continue;
    for (const specifier of statement.specifiers) {
      const isValue = t.isExportSpecifier(specifier) && specifier.exportKind !== TYPE_ONLY;
      if (isValue && t.isIdentifier(specifier.exported)) names.add(specifier.exported.name);
    }
  }
  return names;
}

// A previous port is replaced whole; a folder that holds anything else is left alone
function clearOutDir(outDir: string): void {
  if (!existsSync(outDir)) return;
  const isPreviousPort = existsSync(join(outDir, LEDGER_FILE));
  if (!isPreviousPort && readdirSync(outDir).length > 0) {
    throw new Error(`${outDir} is not empty and holds no ${LEDGER_FILE}: refusing to overwrite it`);
  }
  rmSync(outDir, { recursive: true, force: true });
}

function writeOut(outDir: string, path: string, code: string): void {
  const target = join(outDir, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, code);
}

function writePort(outDir: string, ported: IPortedFile[], root: string): string[] {
  const written: string[] = [];
  for (const file of ported) {
    if (file.moduleCode !== null) {
      writeOut(outDir, file.outPath, file.moduleCode);
      written.push(file.outPath);
    }
    for (const sfc of file.sfcs) {
      writeOut(outDir, sfc.outPath, sfc.code);
      written.push(sfc.outPath);
    }
  }
  if (ported.some((file) => file.usesBridge)) {
    writeOut(outDir, BRIDGE_FILE, readFileSync(BRIDGE_SOURCE, 'utf8'));
    written.push(BRIDGE_FILE);
  }
  const entries = ported.flatMap((file) =>
    file.entries.map((entry) => ({ ...entry, file: relative(root, entry.file) })),
  );
  writeOut(outDir, LEDGER_FILE, `${JSON.stringify({ files: written, entries }, null, 2)}\n`);
  return written;
}

export function portPackageToVueSfc(root: string, outDir: string): IPortReport {
  const entry = findEntry(root);
  if (entry === undefined) throw new Error(`no index file under ${root}`);
  const readFile = createFileReader();
  const state: IPackageState = {
    root,
    readFile,
    exportsOf: new Map(),
    outPathOf: (file) => {
      const path = relative(root, file);
      return path.replace(PLATFORM_SUFFIX, '').replace(SOURCE_EXTENSION, '.ts');
    },
    adapterModule: ADAPTER_MODULE,
    adapterExports: adapterExports(),
  };
  const ported = reachableFiles(entry, readFile).map((file) => {
    const result = portFile(file, state);
    state.exportsOf.set(file, result.exports);
    return result;
  });
  clearOutDir(outDir);
  const files = writePort(outDir, ported, root);
  return { outDir, files, entries: ported.flatMap((file) => file.entries) };
}

if (import.meta.main) {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [root, outDir] = positionals;
  if (!root || !outDir) {
    throw new Error('Usage: node src/port/port-package.ts <package-src-dir> <out-dir>');
  }
  const report = portPackageToVueSfc(root, outDir);
  const refused = report.entries.filter((entry) => entry.status === PORT_STATUS.refused);
  const lines = refused.map((entry) => `refused ${entry.name}: ${entry.reason ?? ''}`);
  const total = `${report.entries.length - refused.length} ported, ${refused.length} refused`;
  const summary = `${total}, ${report.files.length} files`;
  process.stdout.write(`${[...lines, summary].join('\n')}\n`);
}
