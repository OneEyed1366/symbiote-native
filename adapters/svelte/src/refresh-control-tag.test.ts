// `refresh-control` as a TAG, through the REAL Svelte compiler. The placement and the
// controlled-spinner handshake itself (lastNativeReport, the deferred snap-back check) live on the
// engine node (`core/components/src/behaviors/refresh-control.ts`) and are fully unit-tested there;
// this file proves the SVELTE WIRING: compiled markup reaches the tag, its props (refreshing, the
// Android-only `enabled`, `title`) forward to native, its `topRefresh` event reaches `onRefresh`,
// and the snap-back command fires/stays silent through Svelte's own reactivity — the same
// bridge-smoke shape React's and Solid's RefreshControl suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: nothing here throws.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what runs the machine. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();
const REFRESH_CONTROL_VIEW = 'PullToRefreshView';

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-refresh-control-tag.mjs');

const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
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

let nextRoot = 9_992;

/** Compile a real `.svelte` source, mount it with the given props, settle. */
async function mountSource(
  source: string,
  props: Record<string, unknown> = {},
): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, {
      ...COMPILE_OPTIONS,
      filename: 'RefreshControlTag.svelte',
    }).js.code,
  );
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string or it
  // silently re-runs the previous arm's module (svelte-adapter-dom-shim §15).
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${root}`
  )) as { default: Component };
  mount(root, Probe, props);
  await settle();
  return root;
}

beforeEach(() => fabric.reset());

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('Svelte: `refresh-control` as a tag', () => {
  it('forwards refreshing, the Android-only enabled prop, and title to native', async () => {
    const root = await mountSource(
      `<refresh-control refreshing={false} enabled={true} title="Pull to refresh"></refresh-control>`,
    );

    const props = refreshNode().props;
    expect(props.refreshing).toBe(false);
    expect(props.enabled).toBe(true);
    expect(props.title).toBe('Pull to refresh');

    unmount(root);
    await settle();
  });

  it('calls onRefresh when topRefresh fires on the refresh-control node', async () => {
    let refreshed = false;
    const root = await mountSource(
      `<script>let { onRefresh } = $props();</script><refresh-control refreshing={false} onRefresh={onRefresh}></refresh-control>`,
      {
        onRefresh: () => {
          refreshed = true;
        },
      },
    );

    fabric.fireEvent(refreshNode().instanceHandle, 'topRefresh', {});
    expect(refreshed).toBe(true);

    unmount(root);
    await settle();
  });

  // why: native has already started spinning by the time onRefresh runs; a handler that leaves
  // `refreshing` false must command native back down (RefreshControl.js:145-166) — proven here
  // through Svelte's own event dispatch, not core's raw routeProp.
  it('commands native back down when the handler leaves refreshing false', async () => {
    const root = await mountSource(
      `<refresh-control refreshing={false} onRefresh={() => {}}></refresh-control>`,
    );

    fabric.fireEvent(refreshNode().instanceHandle, 'topRefresh', {});
    await settle();

    expect(
      commandsNamed('setNativeRefreshing').map(entry => entry.args),
    ).toEqual([[false]]);

    unmount(root);
    await settle();
  });

  // why: Svelte's own `$state` write reaching `props.refreshing` is itself scheduled — the deferred
  // snap-back check must see the ACCEPTED value, not fire against the stale pre-accept one.
  it('issues no snap-back command when the app accepts via its own reactive update', async () => {
    const root = await mountSource(
      `<script>let refreshing = $state(false);</script>` +
        `<refresh-control refreshing={refreshing} onRefresh={() => { refreshing = true; }}></refresh-control>`,
    );

    fabric.fireEvent(refreshNode().instanceHandle, 'topRefresh', {});
    await settle();

    expect(commandsNamed('setNativeRefreshing')).toEqual([]);

    unmount(root);
    await settle();
  });
});
