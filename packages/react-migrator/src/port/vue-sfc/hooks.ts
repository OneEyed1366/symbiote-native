// React hooks rewritten to Vue reactivity: in a component's setup, and as a composable of their own
import type { NodePath, Scope } from '@babel/traverse';
import type {
  BlockStatement,
  CallExpression,
  Expression,
  FunctionDeclaration,
  Identifier,
  MemberExpression,
  Statement,
  VariableDeclarator,
} from '@babel/types';
import { babelTypes as t } from '../../source-graph.ts';
import { refuse } from '../ledger.ts';
import {
  REACT_API,
  isFunctionValue,
  isHookName,
  reactCallName,
  unwrapCasts,
} from '../react-shapes.ts';
import type { IReactBindings } from '../react-shapes.ts';

export const VUE_API = {
  shallowRef: 'shallowRef',
  computed: 'computed',
  computedRef: 'ComputedRef',
} as const;
export type IVueApi = (typeof VUE_API)[keyof typeof VUE_API];

export type IHookRules = {
  react: IReactBindings;
  vueApis: Set<IVueApi>;
};

type IRefSource = {
  declarator: NodePath<VariableDeclarator>;
  id: Identifier;
  init: Expression;
  isRef: boolean;
  setter: string | null;
};

// The two members `createContextBridge` hands back, the ones a context port may call
export const BRIDGE_METHOD = { provide: 'provide', read: 'read' } as const;

const VALUE = 'value';
const READ = BRIDGE_METHOD.read;

const valueOf = (name: string): MemberExpression =>
  t.memberExpression(t.identifier(name), t.identifier(VALUE));
const constDeclaration = (name: string, init: Expression): Statement =>
  t.variableDeclaration('const', [t.variableDeclarator(t.identifier(name), init)]);

// A custom hook is a `use*` call React does not own; its port hands back a ref
function customHookName(call: CallExpression, rules: IHookRules): string | null {
  if (reactCallName(call, rules.react) !== null || !t.isIdentifier(call.callee)) return null;
  return isHookName(call.callee.name) ? call.callee.name : null;
}

function hookNameOf(call: CallExpression, rules: IHookRules): string | null {
  const react = reactCallName(call, rules.react);
  if (react !== null) return isHookName(react) ? react : null;
  return customHookName(call, rules);
}

function readContext(argument: CallExpression['arguments'][number] | undefined): Expression {
  if (!t.isIdentifier(argument)) return refuse('useContext of something other than a name');
  return t.callExpression(t.memberExpression(argument, t.identifier(READ)), []);
}

function stateSource(
  declarator: NodePath<VariableDeclarator>,
  call: CallExpression,
  rules: IHookRules,
): IRefSource {
  const { id } = declarator.node;
  if (!t.isArrayPattern(id)) return refuse('useState not destructured into [value, setter]');
  const [value, setter] = id.elements;
  if (!t.isIdentifier(value)) return refuse('useState value that is not a plain name');
  const [initial] = call.arguments;
  if (initial !== undefined && !t.isExpression(initial)) return refuse('useState spread argument');
  const start = isFunctionValue(initial) ? t.callExpression(initial, []) : initial;
  const init = t.callExpression(t.identifier(VUE_API.shallowRef), start ? [start] : []);
  init.typeParameters = call.typeParameters ?? null;
  rules.vueApis.add(VUE_API.shallowRef);
  const setterName = t.isIdentifier(setter) ? setter.name : null;
  return { declarator, id: t.identifier(value.name), init, isRef: true, setter: setterName };
}

function firstArgument(call: CallExpression, hook: string): Expression {
  const [first] = call.arguments;
  return t.isExpression(first) ? first : refuse(`${hook} without a function argument`);
}

function hookSource(declarator: NodePath<VariableDeclarator>, rules: IHookRules): IRefSource | null {
  const { id, init } = declarator.node;
  if (!t.isCallExpression(init)) return null;
  const hook = hookNameOf(init, rules);
  if (hook === null) return null;
  if (hook === REACT_API.useState) return stateSource(declarator, init, rules);
  if (!t.isIdentifier(id)) return refuse(`${hook} result destructured`);
  const plain = { declarator, id, setter: null };
  if (hook === REACT_API.useMemo) {
    rules.vueApis.add(VUE_API.computed);
    const computed = t.callExpression(t.identifier(VUE_API.computed), [firstArgument(init, hook)]);
    return { ...plain, init: computed, isRef: true };
  }
  if (hook === REACT_API.useCallback) {
    return { ...plain, init: firstArgument(init, hook), isRef: false };
  }
  if (hook === REACT_API.useContext) {
    return { ...plain, init: readContext(init.arguments[0]), isRef: true };
  }
  if (customHookName(init, rules) !== null) return { ...plain, init, isRef: true };
  return refuse(`${hook} in a component: no rule yet`);
}

function refSources(statement: NodePath<Statement>, rules: IHookRules): IRefSource[] {
  if (!statement.isVariableDeclaration()) return [];
  return statement
    .get('declarations')
    .flatMap((declarator) => hookSource(declarator, rules) ?? []);
}

function refuseStrayHooks(
  body: NodePath<BlockStatement>,
  sources: IRefSource[],
  rules: IHookRules,
): void {
  const placed = new Set(sources.map((source) => source.declarator.node.init));
  body.traverse({
    CallExpression(path) {
      const hook = hookNameOf(path.node, rules);
      if (hook !== null && !placed.has(path.node)) {
        refuse(`${hook} outside a top-level declaration`);
      }
    },
  });
}

// A ref-held value is read through `.value`; a shorthand `{ x }` becomes `{ x: x.value }`
export function readThroughValue(scope: Scope, names: readonly string[]): void {
  for (const name of names) {
    const binding = scope.getBinding(name);
    if (binding === undefined) continue;
    if (binding.constantViolations.length > 0) refuse(`${name} is reassigned`);
    for (const reference of binding.referencePaths) {
      const parent = reference.parentPath;
      const isShorthand =
        parent?.isObjectProperty() && parent.node.shorthand && parent.node.value === reference.node;
      if (isShorthand && parent?.isObjectProperty()) {
        parent.node.shorthand = false;
        parent.node.value = valueOf(name);
        continue;
      }
      reference.replaceWith(valueOf(name));
    }
  }
}

// `setX(next)` assigns, `setX(prev => next)` assigns the updater's result over the current value
function rewriteSetter(scope: Scope, state: string, setter: string): void {
  for (const reference of scope.getBinding(setter)?.referencePaths ?? []) {
    const call = reference.parentPath;
    const isOneArgumentCall =
      call?.isCallExpression() &&
      call.node.callee === reference.node &&
      call.node.arguments.length === 1;
    if (!isOneArgumentCall || !call?.isCallExpression()) {
      return refuse(`${setter} used other than as a one-argument call`);
    }
    const [next] = call.node.arguments;
    if (!t.isExpression(next)) return refuse(`${setter} spread argument`);
    const value = isFunctionValue(next) ? t.callExpression(next, [valueOf(state)]) : next;
    call.replaceWith(t.assignmentExpression('=', valueOf(state), value));
  }
}

export function rewriteComponentHooks(body: NodePath<BlockStatement>, rules: IHookRules): void {
  body.scope.crawl();
  const sources = body.get('body').flatMap((statement) => refSources(statement, rules));
  refuseStrayHooks(body, sources, rules);
  const refNames = sources.filter((source) => source.isRef).map((source) => source.id.name);
  readThroughValue(body.scope, refNames);
  for (const { declarator, id, init, setter } of sources) {
    if (setter !== null) rewriteSetter(body.scope, id.name, setter);
    declarator.node.id = id;
    declarator.node.init = init;
  }
}

type IHoist = { statements: Statement[]; reads: Map<string, string> };

function hoistRead(hoist: IHoist, context: Identifier, scope: Scope): Identifier {
  const known = hoist.reads.get(context.name);
  if (known !== undefined) return t.identifier(known);
  const local = scope.generateUidIdentifier(context.name).name;
  hoist.reads.set(context.name, local);
  hoist.statements.push(constDeclaration(local, readContext(context)));
  return t.identifier(local);
}

// `useContext(a ? A : B)` reads both contexts up front and picks one where the value is used
function contextValue(call: CallExpression, hoist: IHoist, scope: Scope): Expression {
  const [first] = call.arguments;
  const argument = first === undefined ? first : unwrapCasts(first);
  if (t.isIdentifier(argument)) {
    return t.memberExpression(hoistRead(hoist, argument, scope), t.identifier(VALUE));
  }
  if (!t.isConditionalExpression(argument)) return refuse('useContext argument shape');
  const { test, consequent, alternate } = argument;
  if (!t.isIdentifier(consequent) || !t.isIdentifier(alternate)) {
    return refuse('useContext picks between non-names');
  }
  const picked = t.conditionalExpression(
    test,
    hoistRead(hoist, consequent, scope),
    hoistRead(hoist, alternate, scope),
  );
  return t.memberExpression(picked, t.identifier(VALUE));
}

function refuseBodyLocals(call: NodePath<CallExpression>, owner: NodePath<FunctionDeclaration>) {
  call.traverse({
    Identifier(path) {
      if (!path.isReferencedIdentifier()) return;
      const binding = path.scope.getBinding(path.node.name);
      if (binding?.scope === owner.scope && binding.kind !== 'param') {
        refuse(`hook argument ${path.node.name} is computed in the hook body`);
      }
    },
  });
}

function hoistHookCalls(fn: NodePath<FunctionDeclaration>, rules: IHookRules): IHoist {
  const hoist: IHoist = { statements: [], reads: new Map() };
  fn.get('body').traverse({
    CallExpression(path) {
      const hook = hookNameOf(path.node, rules);
      if (hook === null) return;
      if (path.getFunctionParent() !== fn) refuse(`${hook} inside a nested function`);
      if (hook === REACT_API.useContext) {
        path.replaceWith(contextValue(path.node, hoist, fn.scope));
        return;
      }
      if (customHookName(path.node, rules) === null) refuse(`${hook} in a custom hook: no rule yet`);
      refuseBodyLocals(path, fn);
      const local = fn.scope.generateUidIdentifier(hook).name;
      hoist.statements.push(constDeclaration(local, path.node));
      path.replaceWith(valueOf(local));
    },
  });
  return hoist;
}

function typeAsComputedRef(fn: NodePath<FunctionDeclaration>, rules: IHookRules): void {
  const returned = fn.node.returnType;
  if (!t.isTSTypeAnnotation(returned)) return;
  rules.vueApis.add(VUE_API.computedRef);
  const typeArguments = t.tsTypeParameterInstantiation([returned.typeAnnotation]);
  returned.typeAnnotation = t.tsTypeReference(t.identifier(VUE_API.computedRef), typeArguments);
}

// A hook body runs once in setup: its hook calls are hoisted, the rest becomes one `computed`
export function rewriteComposable(fn: NodePath<FunctionDeclaration>, rules: IHookRules): void {
  const hoist = hoistHookCalls(fn, rules);
  const rest = fn.node.body.body;
  const [only] = rest;
  const derived =
    rest.length === 1 && t.isReturnStatement(only) && only.argument
      ? only.argument
      : t.blockStatement(rest);
  const getter = t.arrowFunctionExpression([], derived);
  const computed = t.callExpression(t.identifier(VUE_API.computed), [getter]);
  fn.node.body.body = [...hoist.statements, t.returnStatement(computed)];
  rules.vueApis.add(VUE_API.computed);
  typeAsComputedRef(fn, rules);
}
