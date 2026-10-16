import { createRoot } from 'solid-js';
import { firstResultOf } from './first-result';

// Runs `composable` inside a reactive root, the owner a primitive needs outside a component
export function renderComposable<Result>(composable: () => Result) {
  const results: Result[] = [];
  const dispose = createRoot(stop => {
    results.push(composable());
    return stop;
  });

  return {
    result: (): Result => firstResultOf(results),
    unmount: dispose,
  };
}
