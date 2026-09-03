// Proves the v-show shim: the compiled `v-show` directive
// resolves to a real implementation (not the DOM-only @vue/runtime-dom one), toggles the
// committed node's style.display without clobbering other declarative style props, and survives
// the async-commit race on the very first mount — Vue's `mounted` hook fires synchronously
// during the patch pass, but this renderer coalesces the actual Fabric commit onto a microtask
// (surface.requestCommit()), so a bare setNativeProps call here would silently no-op on mount
// without the whenCommitted guard. The directive's effect is always
// a targeted follow-up clone on top of the render's own commit (setNativeProps re-commits, it
// doesn't mutate in place), so assertions read the LATEST committed tree (`fabric.committed`),
// not the original `createNode`'d node (`fabric.find`), which never reflects a later clone.

import { defineComponent, h, ref, withDirectives } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { useCssModule, vShow, withKeys, withModifiers } from './index';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 340;
const VIEW = 'RCTView';
const PADDING = 4;

const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
}

function committedView(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === VIEW) found = node;
  });
  expect(found, `a ${VIEW} was committed`).toBeDefined();
  if (found === undefined) throw new Error('unreachable: View missing');
  return found;
}

function mountShowable(visible: boolean): void {
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        withDirectives(h('symbiote-view', { style: { padding: PADDING } }), [
          [vShow, visible],
        ]),
    }),
  );
}

// why: no Negative group — vShow has no invalid input (its `value` is a plain boolean coerced by
// the directive binding, never user-supplied data that could be malformed) and no guard clause.
// The whole surface is "does the directive converge on the right display value", grouped below by
// the two distinct mechanisms that could break that: the async-commit race on first mount, and
// clobbering unrelated style props on later re-commits.
describe('vShow runtime-helpers shim', () => {
  it('applies display:none on the very first mount despite the async-commit race', async () => {
    // why: Vue's `mounted` hook is synchronous but this renderer's Fabric commit is coalesced onto
    // a microtask — a bare setNativeProps at mount time would read no tag yet and silently no-op
    // (vue-adapter-reactivity Gotcha 2). whenCommitted is what makes this converge at all.
    mountShowable(false);
    await tick();
    const node = committedView();
    expect(node.props.display).toBe('none');
    expect(node.props.padding, 'other style props survive').toBe(PADDING);
  });

  it('leaves display unset when mounted visible', async () => {
    mountShowable(true);
    await tick();
    expect(committedView().props.display).not.toBe('none');
  });

  // why: setNativeProps merges a partial style object rather than replacing it — a directive that
  // clobbered sibling style props on every toggle would silently reset unrelated layout each time
  // visibility changes, a real regression class for any component styled + conditionally shown.
  it('toggles display back and forth without clobbering other style props', async () => {
    const visible = ref(true);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          withDirectives(h('symbiote-view', { style: { padding: PADDING } }), [
            [vShow, visible.value],
          ]),
      }),
    );
    await tick();
    expect(committedView().props.display).not.toBe('none');

    visible.value = false;
    await tick();
    let node = committedView();
    expect(node.props.display).toBe('none');
    expect(node.props.padding).toBe(PADDING);

    visible.value = true;
    await tick();
    node = committedView();
    expect(node.props.display).not.toBe('none');
    expect(node.props.padding).toBe(PADDING);
  });

  // why: applyShow explicitly cancels the PREVIOUS pending whenCommitted wait before scheduling a
  // new one (`pendingShowCommits.get(el)?.()` at the top of applyShow) — proving the directive
  // converges on the LAST value when toggled again before the first commit lands is the only way
  // to show that cancellation actually prevents a stale first-mount apply from firing after a
  // later toggle already landed, rather than just happening to pass because nothing raced.
  it('converges to the last value when toggled again before the first commit lands', async () => {
    const visible = ref(false);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          withDirectives(h('symbiote-view', { style: { padding: PADDING } }), [
            [vShow, visible.value],
          ]),
      }),
    );
    // Flip again before any macrotask boundary — both the Vue re-render and the engine's
    // microtask-coalesced commit are still pending at this point.
    visible.value = true;
    await tick();
    expect(committedView().props.display).not.toBe('none');
  });
});

// why: withModifiers/withKeys are what `v-on.stop`/`.self`/`.enter` compile to — before this shim
// existed, that compiled import silently resolved to `undefined` from `@vue/runtime-core` (it only
// exists in the DOM-only `@vue/runtime-dom`), so any template using a v-on modifier would crash at
// import time. These are plain event-object functions (call `stopPropagation`, compare
// `target`/`currentTarget`, read `.key`) with no DOM/engine dependency, copied from upstream Vue's
// own implementation verbatim.
describe('withModifiers runtime-helpers shim', () => {
  it('calls the handler when no guard matches', () => {
    const handler = vi.fn();
    withModifiers(handler, ['ctrl'])({ ctrlKey: true } as never);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('stops propagation and still calls the handler for .stop', () => {
    const handler = vi.fn();
    const stopPropagation = vi.fn();
    withModifiers(handler, ['stop'])({ stopPropagation } as never);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('skips the handler for .self when the event did not originate on the element itself', () => {
    const handler = vi.fn();
    withModifiers(handler, ['self'])({
      target: 'child',
      currentTarget: 'parent',
    } as never);
    expect(handler).not.toHaveBeenCalled();
  });

  it('skips the handler for .right when the event was not the right mouse button', () => {
    const handler = vi.fn();
    withModifiers(handler, ['right'])({ button: 0 } as never);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('withKeys runtime-helpers shim', () => {
  it('calls the handler when the event key matches a named modifier', () => {
    const handler = vi.fn();
    withKeys(handler, ['enter'])({ key: 'Enter' } as never);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('calls the handler when the event key matches a documented alias (esc -> escape)', () => {
    const handler = vi.fn();
    withKeys(handler, ['esc'])({ key: 'Escape' } as never);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('skips the handler for a non-matching key', () => {
    const handler = vi.fn();
    withKeys(handler, ['enter'])({ key: 'Tab' } as never);
    expect(handler).not.toHaveBeenCalled();
  });

  it('no-ops on an event with no .key field, same as upstream Vue on a non-keyboard event', () => {
    const handler = vi.fn();
    withKeys(handler, ['enter'])({} as never);
    expect(handler).not.toHaveBeenCalled();
  });
});

// why: useCssModule reads `__cssModules` off the component's own options — the compiled artifact
// @symbiote-native/css-parser's SFC compiler injects for a `<style module>` block. Proven here by
// setting that field directly, the same shape the real compiler output produces, without needing
// a full SFC compile pass in a unit test.
describe('useCssModule runtime-helpers shim', () => {
  it('returns the class map injected onto the component as __cssModules', async () => {
    let result: Record<string, string> | undefined;
    const component = defineComponent({
      setup: () => () => {
        result = useCssModule();
        return h('symbiote-view');
      },
    });
    (
      component as { __cssModules?: Record<string, Record<string, string>> }
    ).__cssModules = {
      $style: { card: 'card_a1b2c' },
    };
    mount(ROOT_TAG, component);
    await tick();

    expect(result).toEqual({ card: 'card_a1b2c' });
  });

  it('returns an empty map when the current component has no CSS module injected', async () => {
    let result: Record<string, string> | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () => {
          result = useCssModule();
          return h('symbiote-view');
        },
      }),
    );
    await tick();

    expect(result).toEqual({});
  });
});
