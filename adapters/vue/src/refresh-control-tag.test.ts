// `refresh-control` as a TAG, measured through Vue's own renderer. The placement (iOS sibling vs
// Android wrap) and the controlled-spinner handshake itself (lastNativeReport, the deferred
// snap-back check) live on the engine node (`core/components/src/behaviors/refresh-control.ts`)
// and are fully unit-tested there; this file proves the VUE WIRING: a compiled `h('refresh-control',
// …)` element reaches the tag, its props (refreshing, the Android-only `enabled`, `title`) forward
// to native, its `topRefresh` event reaches `onRefresh`, and the snap-back command fires/stays
// silent through Vue's own async reactive update — the same bridge-smoke shape React's and Solid's
// RefreshControl suites already carry (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: nothing here throws.
import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 9_991;
const REFRESH_CONTROL_VIEW = 'PullToRefreshView';
const fabric = installFabric();

const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function refreshNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === REFRESH_CONTROL_VIEW);
  if (node === undefined)
    throw new Error(`no ${REFRESH_CONTROL_VIEW} was created`);
  return node;
}

function commandsNamed(
  name: string,
): ReadonlyArray<{ commandName: string; args: readonly unknown[] }> {
  return fabric.commands.filter(entry => entry.commandName === name);
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Vue: `refresh-control` as a tag', () => {
  it('forwards refreshing, the Android-only enabled prop, and title to native', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('refresh-control', {
            refreshing: false,
            enabled: true,
            title: 'Pull to refresh',
          }),
      }),
    );
    await settle();

    const props = refreshNode().props;
    expect(props.refreshing).toBe(false);
    expect(props.enabled).toBe(true);
    expect(props.title).toBe('Pull to refresh');
  });

  it('calls onRefresh when topRefresh fires on the refresh-control node', async () => {
    let refreshed = false;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('refresh-control', {
            refreshing: false,
            onRefresh: () => {
              refreshed = true;
            },
          }),
      }),
    );
    await settle();

    fabric.fireEvent(refreshNode().instanceHandle, 'topRefresh', {});
    expect(refreshed).toBe(true);
  });

  // why: native has already started spinning by the time onRefresh runs; a handler that leaves
  // `refreshing` false must command native back down (RefreshControl.js:145-166) — proven here
  // through Vue's own event dispatch, not core's raw routeProp.
  it('commands native back down when the handler leaves refreshing false', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('refresh-control', { refreshing: false, onRefresh: () => {} }),
      }),
    );
    await settle();

    fabric.fireEvent(refreshNode().instanceHandle, 'topRefresh', {});
    await settle();

    expect(
      commandsNamed('setNativeRefreshing').map(entry => entry.args),
    ).toEqual([[false]]);
  });

  // why: Vue schedules a `ref` write on its own microtask queue — the deferred snap-back check must
  // see the ACCEPTED value the app's reactive update produces, not fire against the stale
  // pre-accept one (core module header, same reasoning as Switch's twin case).
  it('issues no snap-back command when the app accepts via its own reactive update', async () => {
    const refreshing = ref(false);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('refresh-control', {
            refreshing: refreshing.value,
            onRefresh: () => {
              refreshing.value = true;
            },
          }),
      }),
    );
    await settle();

    fabric.fireEvent(refreshNode().instanceHandle, 'topRefresh', {});
    await settle();

    expect(commandsNamed('setNativeRefreshing')).toEqual([]);
  });
});
