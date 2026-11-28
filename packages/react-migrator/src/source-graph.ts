// Reads a package's source the way Metro would: `.native` first, then the plain file, then an index
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { parse } from '@babel/parser';
import type { ParserPlugin } from '@babel/parser';
import type { TraverseOptions } from '@babel/traverse';
import type { File, ImportDeclaration, Node } from '@babel/types';

const require_ = createRequire(import.meta.url);

// NOTE: `@babel/traverse` and `@babel/generator` are CommonJS with `exports.default`
export const traverse: (parent: Node, options: TraverseOptions) => void =
  require_('@babel/traverse').default;
export const babelTypes: typeof import('@babel/types') = require_('@babel/types');

const MODULE_SUFFIXES = ['.native.ts', '.native.tsx', '.ts', '.tsx', '.js', '.jsx'] as const;
export const ENTRY_NAMES = [
  'index.native.ts', 'index.native.tsx', 'index.ts', 'index.tsx', 'index.js',
] as const;

export type IReadFile = (file: string) => File;

function parserPlugins(file: string): ParserPlugin[] {
  if (file.endsWith('.tsx')) return ['typescript', 'jsx'];
  if (file.endsWith('.ts')) return ['typescript'];
  return ['flow', 'jsx'];
}

// A fresh AST each call: a port mutates what it reads
export function parseFile(file: string): File {
  const source = readFileSync(file, 'utf8');
  return parse(source, { sourceType: 'module', plugins: parserPlugins(file) });
}

export function createFileReader(): IReadFile {
  const files = new Map<string, File>();
  return (file) => {
    const cached = files.get(file);
    if (cached) return cached;
    const ast = parseFile(file);
    files.set(file, ast);
    return ast;
  };
}

export function resolveModule(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = join(dirname(fromFile), specifier);
  const candidates = [
    ...MODULE_SUFFIXES.map((suffix) => base + suffix),
    ...ENTRY_NAMES.map((name) => join(base, name)),
  ];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
}

export const DEFAULT_EXPORT = 'default';
export const NAMESPACE_IMPORT = '*';

// The name the source module exports for one import specifier: a name, `default` or `*`
export function importedNameOf(specifier: ImportDeclaration['specifiers'][number] | undefined) {
  if (babelTypes.isImportSpecifier(specifier)) {
    const { imported } = specifier;
    return babelTypes.isIdentifier(imported) ? imported.name : imported.value;
  }
  return babelTypes.isImportNamespaceSpecifier(specifier) ? NAMESPACE_IMPORT : DEFAULT_EXPORT;
}

export function findEntry(root: string): string | undefined {
  return ENTRY_NAMES.map((name) => join(root, name)).find((path) => existsSync(path));
}
