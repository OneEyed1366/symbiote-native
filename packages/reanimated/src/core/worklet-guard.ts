import type { WorkletFunction } from 'react-native-worklets';
import { isWorkletFunction } from 'react-native-worklets';

// The hooks take plain-looking callbacks; the worklets plugin is what makes them workletized
export function requireWorklet<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
  hookName: string,
): WorkletFunction<Args, Result> {
  if (!isWorkletFunction<Args, Result>(callback)) {
    throw new Error(
      `${hookName} needs a worklet: is the react-native-worklets babel plugin the last one in babel.config.js plugins?`,
    );
  }
  return callback;
}
