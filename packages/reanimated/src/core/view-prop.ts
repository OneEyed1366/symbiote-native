import type { ISymbioteNode } from '@symbiote-native/engine';
import { wrapperOfNode } from './shadow-node-wrapper';

const MODULE_PROXY = '__reanimatedModuleProxy';
const ERROR_PREFIX = 'error:';

type IViewPropProxy = {
  getViewProp<Value>(
    wrapper: unknown,
    propName: string,
    answer: (result: Value) => void,
  ): void;
};

function isViewPropProxy(value: unknown): value is IViewPropProxy {
  return (
    typeof value === 'object' &&
    value !== null &&
    'getViewProp' in value &&
    typeof value.getViewProp === 'function'
  );
}

// Asked of the native proxy, as upstream's route loads the renderer of React Native on first use
// and that renderer takes over the one event handler of the runtime
export function getViewProp<Value>(
  _viewTag: number,
  propName: string,
  node: ISymbioteNode | null | undefined,
): Promise<Value> {
  const wrapper = node ? wrapperOfNode(node) : undefined;
  if (wrapper === undefined) {
    throw new Error(
      '[Reanimated] Function `getViewProp` requires a component to be passed as an argument on Fabric.',
    );
  }
  const proxy: unknown = Reflect.get(globalThis, MODULE_PROXY);
  if (!isViewPropProxy(proxy)) {
    throw new Error('[Reanimated] The native module is not installed.');
  }
  return new Promise((resolve, reject) => {
    proxy.getViewProp<Value>(wrapper, propName, result => {
      if (typeof result === 'string' && result.startsWith(ERROR_PREFIX)) {
        reject(result);
      } else {
        resolve(result);
      }
    });
  });
}
