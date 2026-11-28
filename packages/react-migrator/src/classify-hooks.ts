// Sorts every exported `use*` of a package by the hooks and subscriptions its body calls
// Public = reachable by re-exports from `<src>/index`, `.native` first, as Metro picks it
// Usage: node src/classify-hooks.ts <package-src-dir>
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CallExpression, Declaration, Node, Program, Statement } from '@babel/types';
import { createFileReader, findEntry, resolveModule, traverse } from './source-graph.ts';

const NODE = {
  identifier: 'Identifier',
  member: 'MemberExpression',
  importDeclaration: 'ImportDeclaration',
  importSpecifier: 'ImportSpecifier',
  exportAll: 'ExportAllDeclaration',
  exportNamed: 'ExportNamedDeclaration',
  exportSpecifier: 'ExportSpecifier',
  functionDeclaration: 'FunctionDeclaration',
  variableDeclaration: 'VariableDeclaration',
} as const;

export const HOOK_KIND = {
  reanimated: 'reanimated',
  subscription: 'subscription',
  context: 'context',
  compositeEffect: 'composite+effect',
  effectOnly: 'effect-only',
  noHooks: 'no-hooks',
  derived: 'derived',
  composite: 'composite',
  other: 'other',
} as const;
export type IHookKind = (typeof HOOK_KIND)[keyof typeof HOOK_KIND];

export type IHookEntry = {
  kind: IHookKind;
  isPublic: boolean;
  file: string;
  line: number;
  name: string;
  calls: string[];
};
export type IHookTotals = Partial<Record<IHookKind, number>>;
export type IHookReport = {
  entries: IHookEntry[];
  parseErrors: { file: string; message: string }[];
  totals: { public: IHookTotals; all: IHookTotals };
};

const KIND_COLUMN_WIDTH = 16;
const HOOK_NAME = /^use[A-Z]/;
const SOURCE_FILE = /\.(ts|tsx|js|jsx)$/;
const TEST_FILE = /\.(test|spec)\./;

const REACT_HOOK_NAMES = [
  'useContext', 'useState', 'useReducer', 'useEffect', 'useLayoutEffect', 'useInsertionEffect',
  'useSyncExternalStore', 'useRef', 'useMemo', 'useCallback', 'useImperativeHandle', 'use',
] as const;
type IReactHookName = (typeof REACT_HOOK_NAMES)[number];
const STATE_HOOK_NAMES = [
  'useState', 'useReducer', 'useSyncExternalStore',
] as const satisfies readonly IReactHookName[];
const DERIVED_HOOK_NAMES = ['useMemo', 'useCallback', 'useRef'] as const satisfies readonly IReactHookName[];
const SKIPPED_DIR_NAMES = ['__tests__', '__mocks__', 'specs', 'node_modules'] as const;
type ISkippedDir = (typeof SKIPPED_DIR_NAMES)[number];
const SUBSCRIBE_CALL_NAMES = ['addListener', 'addEventListener', 'subscribe', 'on'] as const;
type ISubscribeCall = (typeof SUBSCRIBE_CALL_NAMES)[number];
const REANIMATED_HOOK_NAMES = [
  'useSharedValue', 'useAnimatedReaction', 'useEvent', 'useHandler', 'useAnimatedStyle',
  'useDerivedValue', 'useWorkletCallback', 'useAnimatedScrollHandler', 'useAnimatedRef',
  'useFrameCallback', 'useAnimatedProps',
] as const;
type IReanimatedHookName = (typeof REANIMATED_HOOK_NAMES)[number];

const REACT_HOOKS: ReadonlySet<string> = new Set<IReactHookName>(REACT_HOOK_NAMES);
const STATE_HOOKS: ReadonlySet<string> = new Set<IReactHookName>(STATE_HOOK_NAMES);
const DERIVED_HOOKS: ReadonlySet<string> = new Set<IReactHookName>(DERIVED_HOOK_NAMES);
const SKIPPED_DIRS: ReadonlySet<string> = new Set<ISkippedDir>(SKIPPED_DIR_NAMES);
const SUBSCRIBE_CALLS: ReadonlySet<string> = new Set<ISubscribeCall>(SUBSCRIBE_CALL_NAMES);
const REANIMATED_HOOKS: ReadonlySet<string> = new Set<IReanimatedHookName>(REANIMATED_HOOK_NAMES);

type ICalls = { names: Set<string>; hasWorklet: boolean };
type IHookSite = { name: string; body: Node; line: number };
type IReach = { wholeFiles: Set<string>; named: Set<string> };
type IReadProgram = (file: string) => Program;

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : listSourceFiles(path);
    return SOURCE_FILE.test(name) && !TEST_FILE.test(name) ? [path] : [];
  });
}

// Maps an aliased import back to its real name (`useReanimatedAnimatedProps`)
function importAliases(program: Program): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const statement of program.body) {
    if (statement.type !== NODE.importDeclaration) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === NODE.importSpecifier && specifier.imported.type === NODE.identifier) {
        aliases.set(specifier.local.name, specifier.imported.name);
      }
    }
  }
  return aliases;
}

function calleeName(callee: CallExpression['callee']): string | null {
  if (callee.type === NODE.identifier) return callee.name;
  if (callee.type === NODE.member && callee.property.type === NODE.identifier) return callee.property.name;
  return null;
}

// `noScope`, as a hook body is traversed on its own, outside the program that holds its bindings
function collectCalls(root: Node, aliases: Map<string, string>): ICalls {
  const calls: ICalls = { names: new Set(), hasWorklet: false };
  traverse(root, {
    noScope: true,
    CallExpression(path) {
      const name = calleeName(path.node.callee);
      if (name) calls.names.add(aliases.get(name) ?? name);
    },
    Directive(path) {
      if (path.node.value.value === 'worklet') calls.hasWorklet = true;
    },
  });
  return calls;
}

function toFacts({ names, hasWorklet }: ICalls) {
  const all = [...names];
  const react = all.filter((name) => REACT_HOOKS.has(name));
  const custom = all.filter(
    (name) => HOOK_NAME.test(name) && !REACT_HOOKS.has(name) && !REANIMATED_HOOKS.has(name),
  );
  return {
    react,
    hasCustom: custom.length > 0,
    isReanimated: hasWorklet || all.some((name) => REANIMATED_HOOKS.has(name)),
    hasSubscription: all.some((name) => SUBSCRIBE_CALLS.has(name)),
    hasState: react.some((name) => STATE_HOOKS.has(name)),
    hasEffect: react.some((name) => name.endsWith('Effect')),
    isExternalStore: react.includes('useSyncExternalStore'),
  };
}
type IFacts = ReturnType<typeof toFacts>;

// First matching rule wins, so the order is the precedence between shapes
const RULES: readonly (readonly [IHookKind, (facts: IFacts) => boolean])[] = [
  [HOOK_KIND.reanimated, (f) => f.isReanimated],
  [HOOK_KIND.subscription, (f) => f.isExternalStore || (f.hasState && f.hasEffect && f.hasSubscription)],
  [HOOK_KIND.context, (f) => f.react.length === 1 && f.react[0] === 'useContext' && !f.hasCustom],
  [HOOK_KIND.compositeEffect, (f) => f.hasEffect && !f.hasState && f.hasCustom],
  [HOOK_KIND.effectOnly, (f) => f.hasEffect && !f.hasState],
  [HOOK_KIND.noHooks, (f) => f.react.length === 0 && !f.hasCustom],
  [HOOK_KIND.derived, (f) => f.react.every((name) => DERIVED_HOOKS.has(name)) && !f.hasCustom],
  [HOOK_KIND.composite, (f) => f.hasCustom && !f.hasState],
];

function classify(calls: ICalls): IHookKind {
  const facts = toFacts(calls);
  return RULES.find(([, matches]) => matches(facts))?.[0] ?? HOOK_KIND.other;
}

function hooksOfDeclaration(declaration: Declaration): IHookSite[] {
  if (declaration.type === NODE.functionDeclaration) {
    const name = declaration.id?.name ?? '';
    const line = declaration.loc?.start.line ?? 0;
    return HOOK_NAME.test(name) ? [{ name, body: declaration.body, line }] : [];
  }
  if (declaration.type !== NODE.variableDeclaration) return [];
  return declaration.declarations.flatMap((item) => {
    if (item.id.type !== NODE.identifier || !HOOK_NAME.test(item.id.name) || !item.init) return [];
    return [{ name: item.id.name, body: item.init, line: item.loc?.start.line ?? 0 }];
  });
}

function exportedHooks(program: Program): IHookSite[] {
  return program.body.flatMap((statement) =>
    statement.type === NODE.exportNamed && statement.declaration
      ? hooksOfDeclaration(statement.declaration)
      : [],
  );
}

function followReExport(file: string, statement: Statement, reach: IReach, visit: (f: string) => void) {
  if (statement.type !== NODE.exportAll && statement.type !== NODE.exportNamed) return;
  const target = statement.source ? resolveModule(file, statement.source.value) : null;
  if (!target) return;
  if (statement.type === NODE.exportAll) {
    visit(target);
    return;
  }
  for (const specifier of statement.specifiers) {
    if (specifier.type === NODE.exportSpecifier) reach.named.add(`${target}#${specifier.local.name}`);
  }
}

// Files whose every export is public (reached by `export *`) plus single names re-exported by name
function publicReach(entry: string | undefined, readProgram: IReadProgram): IReach {
  const reach: IReach = { wholeFiles: new Set(), named: new Set() };
  const visit = (file: string): void => {
    if (reach.wholeFiles.has(file)) return;
    reach.wholeFiles.add(file);
    for (const statement of readProgram(file).body) followReExport(file, statement, reach, visit);
  };
  if (entry) visit(entry);
  return reach;
}

function addToTotals(totals: IHookTotals, kind: IHookKind): void {
  totals[kind] = (totals[kind] ?? 0) + 1;
}

function hookEntries(root: string, file: string, program: Program, reach: IReach): IHookEntry[] {
  const aliases = importAliases(program);
  return exportedHooks(program).map((hook) => {
    const calls = collectCalls(hook.body, aliases);
    return {
      kind: classify(calls),
      isPublic: reach.wholeFiles.has(file) || reach.named.has(`${file}#${hook.name}`),
      file: relative(root, file),
      line: hook.line,
      name: hook.name,
      calls: [...calls.names].filter((name) => HOOK_NAME.test(name) || SUBSCRIBE_CALLS.has(name)),
    };
  });
}

export function classifyPackageHooks(root: string): IHookReport {
  const readFile = createFileReader();
  const readProgram: IReadProgram = (file) => readFile(file).program;
  const entry = findEntry(root);
  const reach = publicReach(entry, readProgram);
  const report: IHookReport = { entries: [], parseErrors: [], totals: { public: {}, all: {} } };
  for (const file of listSourceFiles(root)) {
    try {
      report.entries.push(...hookEntries(root, file, readProgram(file), reach));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.parseErrors.push({ file: relative(root, file), message });
    }
  }
  for (const hook of report.entries) {
    addToTotals(report.totals.all, hook.kind);
    if (hook.isPublic) addToTotals(report.totals.public, hook.kind);
  }
  return report;
}

function formatReport(report: IHookReport): string {
  const hookLines = report.entries.map((hook) => {
    const scope = hook.isPublic ? 'public  ' : 'internal';
    const site = `${hook.file}:${hook.line} ${hook.name}`;
    return `${hook.kind.padEnd(KIND_COLUMN_WIDTH)} ${scope} ${site}  [${hook.calls.join(', ')}]`;
  });
  const failureLines = report.parseErrors.map((failure) => `parse-error ${failure.file}: ${failure.message}`);
  return [
    ...hookLines,
    ...failureLines,
    '',
    `PUBLIC ${JSON.stringify(report.totals.public)}`,
    `ALL    ${JSON.stringify(report.totals.all)}`,
  ].join('\n');
}

if (import.meta.main) {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: node src/classify-hooks.ts <package-src-dir>');
  process.stdout.write(`${formatReport(classifyPackageHooks(root))}\n`);
}
