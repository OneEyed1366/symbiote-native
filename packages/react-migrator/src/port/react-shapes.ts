// Recognises the React forms a port has a rule for: components, hooks, contexts, React calls
import type { NodePath } from '@babel/traverse';
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  FunctionExpression,
  Function as IFunction,
  Node,
} from '@babel/types';
import { babelTypes as t, traverse } from '../source-graph.ts';

export const REACT_MODULE = 'react';
const COMPONENT_NAME = /^[A-Z]/;
const HOOK_NAME = /^use[A-Z]/;

export const REACT_API = {
  createContext: 'createContext',
  forwardRef: 'forwardRef',
  memo: 'memo',
  useContext: 'useContext',
  useState: 'useState',
  useMemo: 'useMemo',
  useCallback: 'useCallback',
} as const;
export type IReactApi = (typeof REACT_API)[keyof typeof REACT_API];

const WRAPPERS: ReadonlySet<string> = new Set<IReactApi>([REACT_API.forwardRef, REACT_API.memo]);

export const isComponentName = (name: string): boolean => COMPONENT_NAME.test(name);
export const isHookName = (name: string): boolean => HOOK_NAME.test(name);

export function isFunctionValue(
  node: Node | null | undefined,
): node is ArrowFunctionExpression | FunctionExpression {
  return t.isArrowFunctionExpression(node) || t.isFunctionExpression(node);
}

export function unwrapCasts(node: Node): Node {
  return t.isTSAsExpression(node) || t.isTSSatisfiesExpression(node)
    ? unwrapCasts(node.expression)
    : node;
}

// Local name -> imported name of every `react` import; a namespace import maps to NAMESPACE
export type IReactBindings = ReadonlyMap<string, string>;
export const NAMESPACE = '*';

// `useState()`, `useS()` from `{ useState as useS }` and `React.useState()` all read `useState`
export function reactCallName(call: CallExpression, react: IReactBindings): string | null {
  const { callee } = call;
  if (t.isIdentifier(callee)) {
    const imported = react.get(callee.name);
    return imported === undefined || imported === NAMESPACE ? null : imported;
  }
  if (!t.isMemberExpression(callee) || !t.isIdentifier(callee.object)) return null;
  const isNamespaceCall = react.get(callee.object.name) === NAMESPACE;
  return isNamespaceCall && t.isIdentifier(callee.property) ? callee.property.name : null;
}

export function containsJsx(node: Node): boolean {
  let hasJsx = false;
  const stopAtJsx = (path: NodePath): void => {
    hasJsx = true;
    path.stop();
  };
  traverse(node, { noScope: true, JSXElement: stopAtJsx, JSXFragment: stopAtJsx });
  return hasJsx;
}

// `forwardRef(fn)` and `memo(fn)` hand back the render function inside, `fn` hands back itself
export function unwrapComponent(
  path: NodePath<Expression>,
  react: IReactBindings,
): NodePath<IFunction> | null {
  if (path.isArrowFunctionExpression() || path.isFunctionExpression()) return path;
  if (!path.isCallExpression()) return null;
  const name = reactCallName(path.node, react);
  if (name === null || !WRAPPERS.has(name)) return null;
  const [inner] = path.get('arguments');
  return inner?.isExpression() ? unwrapComponent(inner, react) : null;
}

export function isCreateContext(node: Node | null | undefined, react: IReactBindings) {
  return t.isCallExpression(node) && reactCallName(node, react) === REACT_API.createContext;
}
