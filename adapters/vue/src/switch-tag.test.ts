// `switch` as a TAG, measured through Vue's own renderer. The state machine itself
// (lastNativeReport, the deferred snap-back check, the color/disabled prop fold) lives on the
// engine node (`core/components/src/behaviors/switch.ts`) and is fully unit-tested there; this
// file proves the VUE WIRING: a compiled `h('switch', …)` element reaches the tag, its props fold
// to the native names, its `change` event reaches `onValueChange`, and the snap-back command
// fires/stays silent through Vue's own async reactive update — the same bridge-smoke shape
// React's and Solid's Switch suites already carry
// (`.docs/test-cases/rn-parity.test-cases.md`).
//
// No Negative group: nothing here throws.
import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 9_980;
const SWITCH_VIEW = 'Switch';
const fabric = installFabric();

const settle = async (): Promise<void> => {
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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Vue: `switch` as a tag', () => {
  it('maps color/disabled props to the native iOS prop names', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('switch', {
            value: true,
            disabled: true,
            trackColor: { false: '#767577', true: '#81b0ff' },
            thumbColor: '#f5dd4b',
          }),
      }),
    );
    await settle();

    const props = switchNode().props;
    expect(props).toMatchObject({
      value: true,
      disabled: true,
      onTintColor: '#81b0ff',
      tintColor: '#767577',
      thumbTintColor: '#f5dd4b',
    });
  });

  // why: onValueChange hands the caller ONE event with the derived boolean carried as `.value` —
  // ported from React's twin, which documents Svelte's single-argument listener constraint that
  // this shape satisfies for every adapter uniformly.
  it('derives onValueChange with the value carried on the event', async () => {
    let changedValue: boolean | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('switch', {
            value: false,
            onValueChange: (event: ISymbioteEvent & { value: boolean }) => {
              changedValue = event.value;
            },
          }),
      }),
    );
    await settle();

    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await settle();
    expect(changedValue).toBe(true);
  });

  it('snaps native back via a setValue command when a no-op handler rejects the toggle', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('switch', { value: false, onValueChange: () => {} }),
      }),
    );
    await settle();

    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await settle();

    const setValue = commandsNamed('setValue');
    expect(setValue, 'a setValue command after a rejected toggle').toHaveLength(
      1,
    );
    expect(setValue[0]!.args[0]).toBe(false);
  });

  // why: the app's own reactive update reaching `props.value` is itself microtask-scheduled in
  // Vue (a `ref` write flushed through Vue's own scheduler) — the deferred snap-back check must
  // see the ACCEPTED value, not fire against the stale pre-accept one.
  it('issues no snap-back command when the app accepts via its own reactive update', async () => {
    const value = ref(false);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('switch', {
            testID: 'subject',
            value: value.value,
            onValueChange: (event: ISymbioteEvent & { value: boolean }) => {
              value.value = event.value;
            },
          }),
      }),
    );
    await settle();

    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await settle();

    expect(commandsNamed('setValue')).toHaveLength(0);
    expect(committedProps('subject')).toMatchObject({ value: true });
  });
});
