import { getNativeTag } from './imperative';
import type { ISymbioteNode } from './node';

type IRequireModule = (moduleName: string) => unknown;

// The result is whatever native answers, the caller names its shape at this I/O edge
export type IExpoViewMethodCaller = <TResult = unknown>(
  node: ISymbioteNode,
  method: string,
  args: readonly unknown[],
) => TResult;

// Expo hangs a view's functions on `ViewPrototypes` of its module, native finds the view by
// the `nativeTag` of `this`. The package passes its own `requireNativeModule`
export function defineExpoViewMethods(
  requireModule: IRequireModule,
  moduleName: string,
  viewName?: string,
): IExpoViewMethodCaller {
  const prototypeKey = viewName ? `${moduleName}_${viewName}` : moduleName;
  return (node, method, args) => {
    const label = `${moduleName}.${method}`;
    const nativeTag = getNativeTag(node);
    if (nativeTag === undefined) {
      throw new Error(`${label}: the view is not mounted yet`);
    }
    const prototypes = Reflect.get(
      requireModule(moduleName) ?? {},
      'ViewPrototypes',
    );
    const viewFunction = Reflect.get(
      Reflect.get(prototypes ?? {}, prototypeKey) ?? {},
      method,
    );
    if (typeof viewFunction !== 'function') {
      throw new Error(`${label} is not a native view function`);
    }
    return Reflect.apply(viewFunction, { nativeTag }, args);
  };
}
