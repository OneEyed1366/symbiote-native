import { defineComponent, h } from '@vue/runtime-core';
import { mount, unmount } from '@symbiote-native/vue';
import { firstResultOf } from './first-result';

let nextRootTag = 30_000;

// Runs `composable` in the setup of a component under the Vue adapter and keeps what it returned
export function renderComposable<Result>(composable: () => Result) {
  nextRootTag += 1;
  const rootTag = nextRootTag;
  const results: Result[] = [];

  mount(
    rootTag,
    defineComponent({
      setup() {
        results.push(composable());
        return () => h('view');
      },
    }),
  );

  return {
    result: (): Result => firstResultOf(results),
    unmount: (): void => unmount(rootTag),
  };
}
