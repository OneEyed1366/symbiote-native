import type { WorkletFunction } from 'react-native-worklets';
import { vi } from 'vitest';

// What the Worklets plugin leaves on a function, written by hand because tests run without it
export function workletOf<Args extends unknown[], Result>(
  worklet: (...args: Args) => Result,
  closure: unknown[],
  hash = 1,
): WorkletFunction<Args, Result> {
  return Object.assign(worklet, { __closure: closure, __workletHash: hash });
}

// Mapper runs and stops land a mocked frame later, so a test lets fake time pass first
export async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50);
}
