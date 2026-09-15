// `switch` as a TAG, through the REAL Svelte compiler. The state machine itself
// (lastNativeReport, the deferred snap-back check, the color/disabled prop fold) lives on the
// engine node (`core/components/src/behaviors/switch.ts`) and is fully unit-tested there; this
// file proves the SVELTE WIRING: compiled markup reaches the tag, its props fold to the native
// names, its `change` event reaches `onValueChange`, and the snap-back command fires/stays
// silent through Svelte's own reactivity — the same bridge-smoke shape React's and Solid's
// Switch suites already carry (`.docs/test-cases/rn-parity.test-cases.md`).
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
const SWITCH_VIEW = 'Switch';

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-switch-tag.mjs');

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

function switchNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SWITCH_VIEW);
  if (node === undefined) throw new Error(`no ${SWITCH_VIEW} was created`);
  return node;
}

// The LIVE tree, by testID — never `fabric.find()`, which reads the pre-clone `created` set and
// can hand back a node's mount-time props after a later update (`test-harness-false-greens.md`).
function committedProps(testID: string): Record<string, unknown> | undefined {
  const walk = (
    nodes: readonly IFakeNode[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node.props;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

function commandsNamed(
  name: string,
): ReadonlyArray<{ commandName: string; args: readonly unknown[] }> {
  return fabric.commands.filter(entry => entry.commandName === name);
}

let nextRoot = 9_970;

/** Compile a real `.svelte` source, mount it with the given props, settle. */
async function mountSource(
  source: string,
  props: Record<string, unknown> = {},
): Promise<number> {
  const root = (nextRoot += 1);
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'SwitchTag.svelte' }).js
      .code,
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

describe('Svelte: `switch` as a tag', () => {
  it('maps color/disabled props to the native iOS prop names', async () => {
    const root = await mountSource(
      `<switch value={true} disabled={true} trackColor={{ false: '#767577', true: '#81b0ff' }} thumbColor="#f5dd4b"></switch>`,
    );

    expect(switchNode().props).toMatchObject({
      value: true,
      disabled: true,
      onTintColor: '#81b0ff',
      tintColor: '#767577',
      thumbTintColor: '#f5dd4b',
    });

    unmount(root);
    await settle();
  });

  // why: onValueChange hands the caller ONE event with the derived boolean carried as `.value` —
  // the single-argument shape Svelte's compiled `on*` attribute requires (module header).
  it('derives onValueChange with the value carried on the event', async () => {
    let changedValue: boolean | undefined;
    const root = await mountSource(
      `<script>let { onValueChange } = $props();</script><switch value={false} onValueChange={onValueChange}></switch>`,
      {
        onValueChange: (event: { value: boolean }) => {
          changedValue = event.value;
        },
      },
    );

    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await settle();
    expect(changedValue).toBe(true);

    unmount(root);
    await settle();
  });

  it('snaps native back via a setValue command when a no-op handler rejects the toggle', async () => {
    const root = await mountSource(
      `<switch value={false} onValueChange={() => {}}></switch>`,
    );

    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await settle();

    const setValue = commandsNamed('setValue');
    expect(setValue, 'a setValue command after a rejected toggle').toHaveLength(
      1,
    );
    expect(setValue[0]!.args[0]).toBe(false);

    unmount(root);
    await settle();
  });

  // why: Svelte's own `$state` write reaching `props.value` is itself scheduled — the deferred
  // snap-back check must see the ACCEPTED value, not fire against the stale pre-accept one.
  it('issues no snap-back command when the app accepts via its own reactive update', async () => {
    const root = await mountSource(
      `<script>let value = $state(false);</script>` +
        `<switch testID="subject" value={value} onValueChange={(event) => { value = event.value; }}></switch>`,
    );

    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await settle();

    expect(commandsNamed('setValue')).toHaveLength(0);
    expect(committedProps('subject')).toMatchObject({ value: true });

    unmount(root);
    await settle();
  });
});
