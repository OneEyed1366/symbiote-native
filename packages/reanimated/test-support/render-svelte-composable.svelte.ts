import { flushSync } from 'svelte';
import { firstResultOf } from './first-result';

// Runs `composable` inside an effect root, the context a rune needs outside a component
export function renderComposable<Result>(composable: () => Result) {
  const results: Result[] = [];
  const dispose = $effect.root(() => {
    results.push(composable());
  });
  flushSync();

  return {
    result: (): Result => firstResultOf(results),
    unmount: (): void => {
      dispose();
      flushSync();
    },
  };
}

// A reactive value a test can change, which a plain test file cannot declare itself
export function reactiveBox<Value>(initial: Value) {
  let held = $state(initial);
  return {
    get value(): Value {
      return held;
    },
    set value(next: Value) {
      held = next;
    },
  };
}
