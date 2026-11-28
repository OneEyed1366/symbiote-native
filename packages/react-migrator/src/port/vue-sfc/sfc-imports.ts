// The imports a ported SFC needs, read off the bindings its setup and template use
import { dirname, relative } from 'node:path';
import type { Binding, NodePath } from '@babel/traverse';
import type { ImportDeclaration, Program } from '@babel/types';
import {
  DEFAULT_EXPORT as DEFAULT_NAME,
  NAMESPACE_IMPORT as NAMESPACE_NAME,
  babelTypes as t,
  importedNameOf,
  resolveModule,
} from '../../source-graph.ts';
import type { IReadFile } from '../../source-graph.ts';
import { refuse } from '../ledger.ts';
import { isComponentName } from '../react-shapes.ts';

export const REACT_NATIVE_MODULE = 'react-native';
export const VUE_MODULE = 'vue';
export const SFC_EXTENSION = '.vue';
export const TYPE_ONLY = 'type';
export const IMPORT_BINDING = 'module';

export type IFileExports = { values: string[]; types: string[]; components: string[] };

// What a port knows about the package while it walks it, dependencies first
export type IPackageState = {
  root: string;
  readFile: IReadFile;
  exportsOf: Map<string, IFileExports>;
  outPathOf: (sourceFile: string) => string;
  adapterModule: string;
  adapterExports: ReadonlySet<string>;
};

export type ISfcScope = {
  file: string;
  program: NodePath<Program>;
  state: IPackageState;
  localComponents: ReadonlySet<string>;
  nativeLocals: ReadonlySet<string>;
  moduleSpecifier: string;
};

export function relativeSpecifier(fromOut: string, toOut: string): string {
  const path = relative(dirname(fromOut), toOut);
  return path.startsWith('.') ? path : `./${path}`;
}

function importedNameOfBinding(binding: Binding): string {
  const { node } = binding.path;
  const isSpecifier =
    t.isImportSpecifier(node) || t.isImportDefaultSpecifier(node) || t.isImportNamespaceSpecifier(node);
  return isSpecifier ? importedNameOf(node) : refuse(`${binding.identifier.name} is no import`);
}

export const isTypeOnlyImport = (declaration: ImportDeclaration): boolean =>
  declaration.importKind === TYPE_ONLY;

// `react-native` values the adapter ships come from the adapter, the rest stay on `react-native`
export function retargetSource(source: string, imported: string, state: IPackageState): string {
  const isAdapterValue = source === REACT_NATIVE_MODULE && state.adapterExports.has(imported);
  return isAdapterValue ? state.adapterModule : source;
}

function componentFile(scope: ISfcScope, source: string, imported: string): string | null {
  const target = resolveModule(scope.file, source);
  const exported = target ? scope.state.exportsOf.get(target) : undefined;
  if (!target || !exported?.components.includes(imported)) return null;
  const sourceOut = scope.state.outPathOf(scope.file);
  const componentOut = `${dirname(scope.state.outPathOf(target))}/${imported}${SFC_EXTENSION}`;
  return relativeSpecifier(sourceOut, componentOut);
}

function namedImport(local: string, imported: string, source: string): string {
  if (imported === DEFAULT_NAME) return `import ${local} from '${source}';`;
  if (imported === NAMESPACE_NAME) return `import * as ${local} from '${source}';`;
  const specifier = imported === local ? local : `${imported} as ${local}`;
  return `import { ${specifier} } from '${source}';`;
}

function importLine(binding: Binding, local: string, scope: ISfcScope): string {
  const declaration = binding.path.parentPath?.node;
  if (!t.isImportDeclaration(declaration)) return refuse(`import of ${local} has no declaration`);
  const source = declaration.source.value;
  if (scope.nativeLocals.has(local)) return `import '${source}';`;
  const imported = importedNameOfBinding(binding);
  const vueFile = componentFile(scope, source, imported);
  if (vueFile !== null) return `import ${local} from '${vueFile}';`;
  const isPackageComponent =
    isComponentName(local) && !source.startsWith('.') && source !== REACT_NATIVE_MODULE;
  if (isPackageComponent) refuse(`${local} from ${source} renders a React component`);
  return namedImport(local, imported, retargetSource(source, imported, scope.state));
}

// One line per name: a component file, a package import, or a name from the file's own module
export function sfcImportLines(
  names: ReadonlySet<string>,
  scope: ISfcScope,
): { lines: string[]; fromModule: string[] } {
  const lines: string[] = [];
  const fromModule: string[] = [];
  for (const name of [...names].sort()) {
    if (scope.localComponents.has(name)) {
      lines.push(`import ${name} from './${name}${SFC_EXTENSION}';`);
      continue;
    }
    const binding = scope.program.scope.getBinding(name);
    if (binding === undefined) continue;
    if (binding.kind === IMPORT_BINDING) lines.push(importLine(binding, name, scope));
    else fromModule.push(name);
  }
  if (fromModule.length > 0) {
    lines.push(`import { ${fromModule.join(', ')} } from '${scope.moduleSpecifier}';`);
  }
  return { lines, fromModule };
}
