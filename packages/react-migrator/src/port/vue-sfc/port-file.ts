// One source file of the package as a `.ts` module plus one `.vue` per component it declares
import { basename } from 'node:path';
import { parse } from '@babel/parser';
import type { NodePath } from '@babel/traverse';
import type {
  ExportNamedDeclaration,
  ImportDeclaration,
  JSXElement,
  Program,
  Statement,
} from '@babel/types';
import { babelTypes as t, parseFile, resolveModule } from '../../source-graph.ts';
import { printCode, stripCasts } from '../codegen.ts';
import { PORT_STATUS, PortRefusal, refuse } from '../ledger.ts';
import type { IPortEntry } from '../ledger.ts';
import { nativeViewOf } from '../native-views.ts';
import { REACT_MODULE } from '../react-shapes.ts';
import { portComponent } from './component.ts';
import { VUE_API } from './hooks.ts';
import type { IVueApi } from './hooks.ts';
import {
  REACT_NATIVE_MODULE,
  SFC_EXTENSION,
  TYPE_ONLY,
  relativeSpecifier,
  retargetSource,
  sfcImportLines,
} from './sfc-imports.ts';
import type { IFileExports, IPackageState } from './sfc-imports.ts';
import {
  BRIDGE_FACTORY,
  declaredName,
  guarded,
  portStatement,
  programOf,
  reactBindings,
} from './statements.ts';
import type { IComponentSite, IFileRun } from './statements.ts';
import { TAG_KIND } from './template.ts';
import type { ITag } from './template.ts';

export const BRIDGE_FILE = 'context-bridge.ts';
const VUE_RUNTIME = '@vue/runtime-core';
const SFC_VUE_MODULE = 'vue';
const PROVIDER = 'Provider';
const TS_EXTENSION = '.ts';
const TYPE_APIS: ReadonlySet<IVueApi> = new Set([VUE_API.computedRef]);

export type ISfcOutput = { name: string; outPath: string; code: string };
export type IPortedFile = {
  outPath: string;
  moduleCode: string | null;
  sfcs: ISfcOutput[];
  exports: IFileExports;
  entries: IPortEntry[];
  usesBridge: boolean;
};

type IFileScope = {
  run: IFileRun;
  state: IPackageState;
  outPath: string;
  localComponents: ReadonlySet<string>;
  internals: Set<string>;
};

function vueImportLines(apis: ReadonlySet<IVueApi>, source: string): string[] {
  const values = [...apis].filter((api) => !TYPE_APIS.has(api)).sort();
  const types = [...apis].filter((api) => TYPE_APIS.has(api)).sort();
  return [
    ...(values.length > 0 ? [`import { ${values.join(', ')} } from '${source}';`] : []),
    ...(types.length > 0 ? [`import type { ${types.join(', ')} } from '${source}';`] : []),
  ];
}

function tagResolver(scope: IFileScope, nativeLocals: Set<string>, tagNames: Set<string>) {
  return (name: JSXElement['openingElement']['name']): ITag => {
    if (t.isJSXMemberExpression(name)) {
      const isProvider = t.isJSXIdentifier(name.object) && name.property.name === PROVIDER;
      if (!isProvider || !t.isJSXIdentifier(name.object)) return refuse('JSX member tag');
      return { kind: TAG_KIND.provider, context: name.object.name };
    }
    if (!t.isJSXIdentifier(name)) return refuse('namespaced JSX tag');
    tagNames.add(name.name);
    const view = nativeViewOf(scope.run.file, name.name, scope.state.readFile);
    if (view === null) return { kind: TAG_KIND.component, name: name.name };
    nativeLocals.add(name.name);
    return { kind: TAG_KIND.native, viewName: view };
  };
}

function sfcFor(site: IComponentSite, scope: IFileScope): ISfcOutput {
  const { run, state } = scope;
  const nativeLocals = new Set<string>();
  const tagNames = new Set<string>();
  const rules = { react: run.react, vueApis: new Set<IVueApi>() };
  const tagOf = tagResolver(scope, nativeLocals, tagNames);
  const port = portComponent({ fn: site.fn, program: run.program, rules, tagOf });
  const names = new Set([...port.programNames, ...tagNames]);
  names.delete(site.name);
  const reactLeft = [...names].find((name) => run.react.has(name));
  if (reactLeft !== undefined) refuse(`React API ${reactLeft} has no rule in a component`);
  const moduleSpecifier = `./${basename(scope.outPath, TS_EXTENSION)}`;
  const others = new Set([...scope.localComponents].filter((name) => name !== site.name));
  const sfcScope = { file: run.file, program: run.program, state, nativeLocals, moduleSpecifier };
  const imports = sfcImportLines(names, { ...sfcScope, localComponents: others });
  for (const name of imports.fromModule) scope.internals.add(name);
  const lines = [...vueImportLines(rules.vueApis, SFC_VUE_MODULE), ...imports.lines];
  const script = `<script setup lang="ts">\n${lines.join('\n')}\n\n${port.setup}</script>\n`;
  const outPath = `${dirnameOf(scope.outPath)}${site.name}${SFC_EXTENSION}`;
  run.entries.push({ file: run.file, name: site.name, status: PORT_STATUS.ported, notes: port.notes });
  return { name: site.name, outPath, code: `${script}\n${port.template}` };
}

function dirnameOf(outPath: string): string {
  const slash = outPath.lastIndexOf('/');
  return slash === -1 ? '' : outPath.slice(0, slash + 1);
}

function portSites(scope: IFileScope): ISfcOutput[] {
  return scope.run.components.flatMap((site) => {
    try {
      return [sfcFor(site, scope)];
    } catch (error) {
      if (!(error instanceof PortRefusal)) throw error;
      const entry = { file: scope.run.file, name: site.name, status: PORT_STATUS.refused };
      scope.run.entries.push({ ...entry, reason: error.message, notes: [] });
      return [];
    }
  });
}

// A name a component imports from the module is exported for it, and kept out of the package API
function exportInternals(program: NodePath<Program>, internals: Set<string>): void {
  for (const name of internals) {
    const declaration = program.scope.getBinding(name)?.path;
    const statement = declaration?.isVariableDeclarator() ? declaration.parentPath : declaration;
    if (!statement?.isDeclaration() || statement.parentPath?.isExportNamedDeclaration()) {
      internals.delete(name);
      continue;
    }
    statement.replaceWith(t.exportNamedDeclaration(statement.node));
  }
}

function retargetReactNative(declaration: NodePath<ImportDeclaration>, state: IPackageState) {
  if (declaration.node.importKind === TYPE_ONLY) return;
  const moved = declaration.node.specifiers.filter((specifier) => {
    const isValue = !t.isImportSpecifier(specifier) || specifier.importKind !== TYPE_ONLY;
    const imported = t.isImportSpecifier(specifier) && t.isIdentifier(specifier.imported)
      ? specifier.imported.name
      : '';
    return isValue && retargetSource(REACT_NATIVE_MODULE, imported, state) !== REACT_NATIVE_MODULE;
  });
  if (moved.length === 0) return;
  declaration.node.specifiers = declaration.node.specifiers.filter((each) => !moved.includes(each));
  declaration.insertAfter(t.importDeclaration(moved, t.stringLiteral(state.adapterModule)));
  if (declaration.node.specifiers.length === 0) declaration.remove();
}

function exportListsFor(target: string, scope: IFileScope): Statement[] {
  const exported = scope.state.exportsOf.get(target);
  if (exported === undefined) return refuse(`re-export of ${target}, which was not ported`);
  const source = relativeSpecifier(scope.outPath, scope.state.outPathOf(target)).replace(/\.ts$/, '');
  const named = (names: string[], kind: 'type' | 'value'): Statement[] => {
    if (names.length === 0) return [];
    const specifiers = names.map((name) => t.exportSpecifier(t.identifier(name), t.identifier(name)));
    const statement = t.exportNamedDeclaration(null, specifiers, t.stringLiteral(source));
    statement.exportKind = kind;
    return [statement];
  };
  const targetDir = dirnameOf(scope.state.outPathOf(target));
  const components = exported.components.map((name) => {
    const vueFile = relativeSpecifier(scope.outPath, `${targetDir}${name}${SFC_EXTENSION}`);
    const specifier = t.exportSpecifier(t.identifier('default'), t.identifier(name));
    return t.exportNamedDeclaration(null, [specifier], t.stringLiteral(vueFile));
  });
  return [...named(exported.values, 'value'), ...named(exported.types, TYPE_ONLY), ...components];
}

function rewriteImports(scope: IFileScope): void {
  for (const statement of scope.run.program.get('body')) {
    if (statement.isImportDeclaration()) {
      const source = statement.node.source.value;
      const isReactValue = source === REACT_MODULE && statement.node.importKind !== TYPE_ONLY;
      if (isReactValue) statement.remove();
      else if (source === REACT_NATIVE_MODULE) retargetReactNative(statement, scope.state);
      continue;
    }
    if (!statement.isExportAllDeclaration()) continue;
    const target = resolveModule(scope.run.file, statement.node.source.value);
    if (target !== null) statement.replaceWithMultiple(exportListsFor(target, scope));
  }
}

// Babel's scope misses a type used inside an `interface` body, so every name in the file counts
function namesOutsideImports(program: NodePath<Program>): Set<string> {
  const names = new Set<string>();
  program.traverse({
    ImportDeclaration: (path) => path.skip(),
    Identifier: (path) => {
      names.add(path.node.name);
    },
  });
  return names;
}

function pruneUnusedImports(program: NodePath<Program>): void {
  const names = namesOutsideImports(program);
  for (const statement of program.get('body')) {
    if (!statement.isImportDeclaration() || statement.node.specifiers.length === 0) continue;
    const used = statement.node.specifiers.filter((specifier) => names.has(specifier.local.name));
    if (used.length === 0) statement.remove();
    else statement.node.specifiers = used;
  }
}

function addModuleImports(scope: IFileScope): void {
  const { run, outPath } = scope;
  const bridge = relativeSpecifier(outPath, BRIDGE_FILE).replace(/\.ts$/, '');
  const lines = [
    ...(run.usesBridge ? [`import { ${BRIDGE_FACTORY} } from '${bridge}';`] : []),
    ...vueImportLines(run.moduleApis, VUE_RUNTIME),
  ];
  if (lines.length === 0) return;
  const parsed = parse(lines.join('\n'), { sourceType: 'module', plugins: ['typescript'] });
  run.program.unshiftContainer('body', parsed.program.body);
}

function addExportedNames(statement: ExportNamedDeclaration, into: IFileExports): void {
  const { declaration, source } = statement;
  const isTypeStatement = statement.exportKind === TYPE_ONLY;
  if (declaration) {
    const isType = t.isTSTypeAliasDeclaration(declaration) || t.isTSInterfaceDeclaration(declaration);
    const names = declaredName(statement).split(',').filter((name) => name !== '');
    (isType || isTypeStatement ? into.types : into.values).push(...names);
    return;
  }
  const isComponentFile = source?.value.endsWith(SFC_EXTENSION) === true;
  for (const specifier of statement.specifiers) {
    if (!t.isExportSpecifier(specifier) || !t.isIdentifier(specifier.exported)) continue;
    const name = specifier.exported.name;
    if (isComponentFile) into.components.push(name);
    else if (isTypeStatement || specifier.exportKind === TYPE_ONLY) into.types.push(name);
    else into.values.push(name);
  }
}

function fileExports(scope: IFileScope, sfcs: ISfcOutput[]): IFileExports {
  const exported: IFileExports = { values: [], types: [], components: [] };
  const { program } = scope.run;
  for (const statement of program.node.body) {
    if (t.isExportNamedDeclaration(statement)) addExportedNames(statement, exported);
  }
  const ported = new Set(sfcs.map((sfc) => sfc.name));
  for (const site of scope.run.components) {
    if (site.isExported && ported.has(site.name)) exported.components.push(site.name);
  }
  exported.values = exported.values.filter((name) => !scope.internals.has(name));
  return exported;
}

function emptyRun(file: string, program: NodePath<Program>): IFileRun {
  return {
    file,
    program,
    react: reactBindings(program),
    contexts: new Set(),
    components: [],
    entries: [],
    moduleApis: new Set(),
    usesBridge: false,
  };
}

const hasCode = (program: Program): boolean =>
  program.body.some((statement) => !t.isImportDeclaration(statement));

export function portFile(file: string, state: IPackageState): IPortedFile {
  const ast = parseFile(file);
  ast.program.directives = [];
  const run = emptyRun(file, programOf(ast));
  for (const statement of run.program.get('body')) {
    const isReExport = statement.isExportNamedDeclaration() && statement.node.source;
    if (statement.isImportDeclaration() || statement.isExportAllDeclaration() || isReExport) continue;
    guarded(run, statement, () => portStatement(statement, run));
  }
  const outPath = state.outPathOf(file);
  const localComponents = new Set(run.components.map((site) => site.name));
  const scope: IFileScope = { run, state, outPath, localComponents, internals: new Set() };
  const sfcs = portSites(scope);
  for (const site of run.components) {
    if (!site.statement.removed) site.statement.remove();
  }
  exportInternals(run.program, scope.internals);
  rewriteImports(scope);
  pruneUnusedImports(run.program);
  addModuleImports(scope);
  stripCasts(ast);
  const moduleCode = hasCode(ast.program) ? `${printCode(ast)}\n` : null;
  const exports = fileExports(scope, sfcs);
  return { outPath, moduleCode, sfcs, exports, entries: run.entries, usesBridge: run.usesBridge };
}
