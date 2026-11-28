// Sorts a file's top-level statements to their rule: component, context, hook, kept, or refused
import type { NodePath } from '@babel/traverse';
import type { File, Function as IFunction, Program, Statement, TSTypeElement } from '@babel/types';
import { DEFAULT_EXPORT, babelTypes as t, importedNameOf, traverse } from '../../source-graph.ts';
import { printCode } from '../codegen.ts';
import { PORT_STATUS, PortRefusal, refuse } from '../ledger.ts';
import type { IPortEntry } from '../ledger.ts';
import {
  NAMESPACE,
  REACT_MODULE,
  containsJsx,
  isComponentName,
  isCreateContext,
  isHookName,
  unwrapComponent,
} from '../react-shapes.ts';
import type { IReactBindings } from '../react-shapes.ts';
import { BRIDGE_METHOD, rewriteComposable } from './hooks.ts';
import type { IVueApi } from './hooks.ts';
import { TYPE_ONLY } from './sfc-imports.ts';

export const BRIDGE_FACTORY = 'createContextBridge';
const DISPLAY_NAME = 'displayName';
const CHILDREN_MEMBER = 'children';
const LEDGER_LABEL_LENGTH = 60;
const BRIDGE_MEMBERS: ReadonlySet<string> = new Set(Object.values(BRIDGE_METHOD));

export type IComponentSite = {
  name: string;
  statement: NodePath<Statement>;
  fn: NodePath<IFunction>;
  isExported: boolean;
};

export type IFileRun = {
  file: string;
  program: NodePath<Program>;
  react: IReactBindings;
  contexts: Set<string>;
  components: IComponentSite[];
  entries: IPortEntry[];
  moduleApis: Set<IVueApi>;
  usesBridge: boolean;
};

export function programOf(ast: File): NodePath<Program> {
  let program: NodePath<Program> | null = null;
  traverse(ast, {
    Program(path) {
      program = path;
      path.stop();
    },
  });
  return program ?? refuse('file without a program');
}

// Only value imports of `react` are rewritten; a type import stays, as it compiles away
export function reactBindings(program: NodePath<Program>): Map<string, string> {
  const react = new Map<string, string>();
  for (const statement of program.node.body) {
    if (!t.isImportDeclaration(statement) || statement.source.value !== REACT_MODULE) continue;
    if (statement.importKind === TYPE_ONLY) continue;
    for (const specifier of statement.specifiers) {
      const imported = importedNameOf(specifier);
      react.set(specifier.local.name, imported === DEFAULT_EXPORT ? NAMESPACE : imported);
    }
  }
  return react;
}

function declarationOf(statement: Statement): Statement | undefined {
  if (!t.isExportNamedDeclaration(statement)) return statement;
  return statement.declaration ?? undefined;
}

export function declaredName(statement: Statement): string {
  const declaration = declarationOf(statement);
  if (t.isVariableDeclaration(declaration)) {
    return declaration.declarations
      .map((each) => (t.isIdentifier(each.id) ? each.id.name : ''))
      .join(',');
  }
  const isNamed =
    t.isFunctionDeclaration(declaration) ||
    t.isClassDeclaration(declaration) ||
    t.isTSTypeAliasDeclaration(declaration) ||
    t.isTSInterfaceDeclaration(declaration);
  return isNamed && declaration.id ? declaration.id.name : '';
}

function isDisplayNameAssignment(statement: Statement): boolean {
  if (!t.isExpressionStatement(statement)) return false;
  const { expression } = statement;
  return (
    t.isAssignmentExpression(expression) &&
    t.isMemberExpression(expression.left) &&
    t.isIdentifier(expression.left.property, { name: DISPLAY_NAME })
  );
}

// `if (isDev) { X.displayName = 'X' }` names a React devtools entry; Vue has no such field
function isDisplayNameBlock(statement: Statement): boolean {
  if (isDisplayNameAssignment(statement)) return true;
  if (!t.isIfStatement(statement) || statement.alternate) return false;
  const { consequent } = statement;
  const body = t.isBlockStatement(consequent) ? consequent.body : [consequent];
  return body.every(isDisplayNameAssignment);
}

function innerDeclaration(statement: NodePath<Statement>): NodePath<Statement> {
  if (!statement.isExportNamedDeclaration()) return statement;
  const declaration = statement.get('declaration');
  return declaration.isStatement() ? declaration : statement;
}

function componentFunction(
  declaration: NodePath<Statement>,
  run: IFileRun,
): NodePath<IFunction> | null {
  if (declaration.isFunctionDeclaration()) {
    const name = declaration.node.id?.name ?? '';
    return isComponentName(name) && containsJsx(declaration.node) ? declaration : null;
  }
  if (!declaration.isVariableDeclaration()) return null;
  const [declarator] = declaration.get('declarations');
  const init = declarator?.get('init');
  const id = declarator?.node.id;
  if (!init?.isExpression() || !t.isIdentifier(id) || !isComponentName(id.name)) return null;
  const fn = unwrapComponent(init, run.react);
  return fn && containsJsx(fn.node) ? fn : null;
}

// `createContext<T>(fallback)` becomes `createContextBridge<T>('Name', fallback)`
function portContext(declaration: NodePath<Statement>, run: IFileRun): boolean {
  if (!declaration.isVariableDeclaration()) return false;
  const [declarator] = declaration.node.declarations;
  const call = declarator?.init;
  if (!declarator || !t.isIdentifier(declarator.id) || !t.isCallExpression(call)) return false;
  if (!isCreateContext(call, run.react)) return false;
  const [fallback] = call.arguments;
  const name = declarator.id.name;
  const fallbackValue = t.isExpression(fallback) ? fallback : t.identifier('undefined');
  const bridge = t.callExpression(t.identifier(BRIDGE_FACTORY), [t.stringLiteral(name), fallbackValue]);
  bridge.typeParameters = call.typeParameters ?? null;
  declarator.init = bridge;
  run.contexts.add(name);
  run.usesBridge = true;
  return true;
}

function typeMembers(node: Statement): TSTypeElement[] | null {
  if (t.isTSInterfaceDeclaration(node)) return node.body.body;
  if (!t.isTSTypeAliasDeclaration(node)) return null;
  return t.isTSTypeLiteral(node.typeAnnotation) ? node.typeAnnotation.members : null;
}

// `children` of a props type is the default slot in Vue: the member goes, its React type with it
function dropChildrenMember(declaration: NodePath<Statement>): string[] {
  const members = typeMembers(declaration.node);
  const index = members?.findIndex(
    (member) => t.isTSPropertySignature(member) && t.isIdentifier(member.key, { name: CHILDREN_MEMBER }),
  );
  if (!members || index === undefined || index === -1) return [];
  members.splice(index, 1);
  return ['children is the default slot, not a prop'];
}

function refuseLeftoverReact(statement: NodePath<Statement>, run: IFileRun): void {
  statement.traverse({
    Identifier(path) {
      if (path.isReferencedIdentifier() && run.react.has(path.node.name)) {
        refuse(`React API ${path.node.name} has no rule`);
      }
    },
    MemberExpression(path) {
      const { object, property } = path.node;
      const isContextMember = t.isIdentifier(object) && run.contexts.has(object.name);
      const member = t.isIdentifier(property) ? property.name : '';
      if (isContextMember && !BRIDGE_MEMBERS.has(member)) {
        refuse(`context member ${member} has no rule`);
      }
    },
  });
}

// Returns notes for the ledger; a component is only collected here and ported by the file step
export function portStatement(statement: NodePath<Statement>, run: IFileRun): string[] {
  if (isDisplayNameBlock(statement.node)) {
    statement.remove();
    return [];
  }
  const declaration = innerDeclaration(statement);
  const fn = componentFunction(declaration, run);
  if (fn !== null) {
    const isExported = statement.isExportNamedDeclaration();
    run.components.push({ name: declaredName(declaration.node), statement, fn, isExported });
    return [];
  }
  if (portContext(declaration, run)) return [];
  const hookName = declaration.isFunctionDeclaration() ? (declaration.node.id?.name ?? '') : '';
  if (declaration.isFunctionDeclaration() && isHookName(hookName)) {
    rewriteComposable(declaration, { react: run.react, vueApis: run.moduleApis });
  } else if (containsJsx(statement.node)) {
    refuse('JSX outside a component: a component factory has no rule');
  }
  const notes = dropChildrenMember(declaration);
  refuseLeftoverReact(statement, run);
  return notes;
}

function record(run: IFileRun, name: string, notes: string[], reason?: string): void {
  const status = reason === undefined ? PORT_STATUS.ported : PORT_STATUS.refused;
  run.entries.push({ file: run.file, name, status, ...(reason ? { reason } : {}), notes });
}

// A refusal drops the whole statement and lands in the ledger with its reason
export function guarded(run: IFileRun, statement: NodePath<Statement>, work: () => string[]) {
  const name = declaredName(statement.node);
  try {
    const notes = work();
    if (name !== '') record(run, name, notes);
  } catch (error) {
    if (!(error instanceof PortRefusal)) throw error;
    const label = name || printCode(statement.node).slice(0, LEDGER_LABEL_LENGTH);
    record(run, label, [], error.message);
    statement.remove();
  }
}
