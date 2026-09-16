// A whole ADAPTER driving the real engine, to find out whether the ~470 adapter test files can come
// here at all.
//
// The risk this file exists to settle: an adapter drags its framework's runtime in, and the runtime
// here is JavaScriptCore with no Node, no DOM and no module loader. Vue is plain JavaScript, so it
// should run — "should" being the word this whole effort exists to remove.
//
// If it renders, the migration path is open for every adapter suite. If it does not, the adapter
// tests need a different answer from the engine tests, and knowing that early is worth one file.

import { h, mount, ref } from '@symbiote-native/vue';

import {
  committedShape,
  describe,
  expect,
  flushTimers,
  it,
  report,
} from './harness';

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 0);
    flushTimers();
  });

describe('the Vue adapter on the real engine', () => {
  // why: the smallest possible proof that a framework can drive this. One component, one host
  // element, and the assertion is on the tree React Native committed.
  it('renders a host element into the committed tree', () => {
    const surface = mount(1, {
      render: () => h('view', { testID: 'from-vue' }),
    });
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View()))');
  });

  // why: nesting through the adapter's own reconciler, which is the path every adapter test walks.
  it('renders nested host elements in order', () => {
    const surface = mount(1, {
      render: () =>
        h('view', { testID: 'outer' }, [
          h('view', { testID: 'first' }),
          h('view', { testID: 'second' }),
        ]),
    });
    surface.commit();

    expect(committedShape()).toBe('RootView(View(View(View()View())))');
  });
});

// why: an adapter test is almost always ASYNC — it changes reactive state and awaits the
// framework's own scheduling before asserting. This is that shape, and it is what decides whether
// the ~470 adapter files can come here at all: a reactive update, a real await, and the assertion
// on the tree React Native committed afterwards.
it('re-renders on a reactive change, after the framework has scheduled it', async () => {
  const expanded = ref(false);
  const surface = mount(1, {
    render: () =>
      h('view', { testID: 'container' }, [
        h('view', { testID: 'always' }),
        ...(expanded.value ? [h('view', { testID: 'sometimes' })] : []),
      ]),
  });
  surface.commit();
  expect(committedShape()).toBe('RootView(View(View(View())))');

  expanded.value = true;
  await tick();
  surface.commit();

  expect(committedShape()).toBe('RootView(View(View(View()View())))');
});

report();
