import { GL_CONTEXTS_GLOBAL } from './constants';
import type { IExpoWebGLRenderingContext } from './types';

export type IWorkletContextManager = {
  getContext(contextId: number): IExpoWebGLRenderingContext | undefined;
  unregister?(contextId: number): void;
};

type IRunOnUI = (
  worklet: (contextId: number) => void,
) => (contextId: number) => void;

function isRunOnUI(value: unknown): value is IRunOnUI {
  return typeof value === 'function';
}

// Reanimated stays optional, and an import of it in a try block in the module that also holds the
// view breaks with `inlineRequires`, so the manager lives in its own file
export function createWorkletContextManager(): IWorkletContextManager {
  try {
    // Reanimated has to load before any workletized code is created
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency, see above
    const reanimated: unknown = require('react-native-reanimated');
    const runOnUI = Reflect.get(Object(reanimated), 'runOnUI');
    if (!isRunOnUI(runOnUI))
      throw new Error('react-native-reanimated has no runOnUI');
    return {
      getContext: contextId => {
        'worklet';
        return Reflect.get(
          Object(Reflect.get(globalThis, GL_CONTEXTS_GLOBAL)),
          String(contextId),
        );
      },
      unregister: contextId => {
        runOnUI(id => {
          'worklet';
          Reflect.deleteProperty(
            Object(Reflect.get(globalThis, GL_CONTEXTS_GLOBAL)),
            String(id),
          );
        })(contextId);
      },
    };
  } catch {
    return {
      getContext: () => {
        throw new Error('Worklet runtime is not available');
      },
    };
  }
}
