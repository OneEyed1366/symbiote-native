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

import { defineComponent, h, ref, shallowRef, withDirectives } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import { Teleport, vShow } from './index';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 340;
const VIEW = 'RCTView';
const PADDING = 4;

const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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
        withDirectives(h('symbiote-view', { style: { padding: PADDING } }), [[vShow, visible]]),
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

// Proves our Teleport wrapper: content moves under an already-
// mounted host node OUTSIDE its own template position (same surface), and the guard rejects a
// target that isn't a real host node instead of silently corrupting the retained tree.
function findByTestId(testId: string): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.props.testID === testId) found = node;
  });
  return found;
}

function isDescendantOf(root: IFakeNode, target: IFakeNode): boolean {
  if (root === target) return true;
  return root.children.some(child => isDescendantOf(child, target));
}

function mountTeleportApp(): void {
  const overlayRef = shallowRef<ISymbioteNode | null>(null);
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => () =>
        h('symbiote-view', {}, [
          h('symbiote-view', { ref: overlayRef, testID: 'overlay-host' }),
          h('symbiote-view', { testID: 'source' }, [
            overlayRef.value
              ? h(Teleport, { to: overlayRef.value }, () =>
                  h('symbiote-view', { testID: 'ported' }),
                )
              : null,
          ]),
        ]),
    }),
  );
}

describe('Teleport runtime-helpers shim', () => {
  describe('Positive', () => {
    // why: the whole reason this wrapper exists over stock Teleport — a real host node target,
    // not a CSS selector, moves content under it while keeping it out of the template parent.
    it('renders content under the target node, not its own template position', async () => {
      mountTeleportApp();
      await tick();

      const overlayHost = findByTestId('overlay-host');
      const source = findByTestId('source');
      const ported = findByTestId('ported');
      expect(overlayHost, 'overlay host was committed').toBeDefined();
      expect(source, 'source was committed').toBeDefined();
      expect(ported, 'ported node was committed').toBeDefined();
      if (overlayHost === undefined || source === undefined || ported === undefined) {
        throw new Error('unreachable');
      }

      expect(
        isDescendantOf(overlayHost, ported),
        'ported node landed under the overlay host',
      ).toBe(true);
      expect(
        isDescendantOf(source, ported),
        'ported node did NOT stay under its own template parent',
      ).toBe(false);
    });

    // why: `disabled` is a documented Vue Teleport option our wrapper passes straight through
    // (setup only validates `to`) — a regression here would silently ship broken in-place
    // rendering even though this wrapper's whole reason to exist is validating `to`, not `disabled`.
    it('keeps content in its own template position when disabled', async () => {
      const overlayRef = shallowRef<ISymbioteNode | null>(null);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h('symbiote-view', {}, [
              h('symbiote-view', { ref: overlayRef, testID: 'overlay-host' }),
              h('symbiote-view', { testID: 'source' }, [
                overlayRef.value
                  ? h(Teleport, { to: overlayRef.value, disabled: true }, () =>
                      h('symbiote-view', { testID: 'ported' }),
                    )
                  : null,
              ]),
            ]),
        }),
      );
      await tick();

      const overlayHost = findByTestId('overlay-host');
      const source = findByTestId('source');
      const ported = findByTestId('ported');
      if (overlayHost === undefined || source === undefined || ported === undefined) {
        throw new Error('unreachable: overlay-host/source/ported missing');
      }

      expect(isDescendantOf(source, ported), 'ported node stayed in its template position').toBe(
        true,
      );
      expect(
        isDescendantOf(overlayHost, ported),
        'ported node did NOT move to the disabled target',
      ).toBe(false);
    });
  });

  describe('Negative — an invalid target throws immediately instead of corrupting the tree', () => {
    // why: renderer.ts stubs querySelector to null (no DOM), so a DOM-world CSS-selector string
    // must fail loudly at the Teleport boundary, not silently resolve `to` to nothing deep inside
    // insert/remove where the failure would be much harder to trace back to the real cause.
    it('throws for a CSS-selector string target instead of silently no-oping', () => {
      expect(() =>
        mount(
          ROOT_TAG,
          defineComponent({
            setup: () => () => h(Teleport, { to: 'body' }, () => h('symbiote-view')),
          }),
        ),
      ).toThrow(/CSS-selector string/);
    });

    // why: `to` is typed `null` (no compile-time check) so a wrong runtime value — a plain object,
    // a forgotten `.value` on a ref — must be caught by this component's own runtime guard before
    // it reaches the real Teleport and silently corrupts the retained tree.
    it('rejects a target that is not a real host node', () => {
      // JSON.parse returns an untyped value, the honest way to hand Teleport something its own
      // `to: null` (no-typecheck) prop would normally accept but our runtime guard must still
      // reject — no `as` cast needed to reach this input, it is a legitimate runtime value.
      const garbage = JSON.parse('{}');
      expect(isSymbioteNode(garbage)).toBe(false);
      expect(() =>
        mount(
          ROOT_TAG,
          defineComponent({
            setup: () => () => h(Teleport, { to: garbage }, () => h('symbiote-view')),
          }),
        ),
      ).toThrow(/not a real host node/);
    });
  });
});
