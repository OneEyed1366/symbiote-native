// Co-located Vue-driven pipeline test, the Vue twin of
// adapters/react/src/components/switch/switch.test.tsx. Proves the Switch contract through Vue's
// reactive lifecycle (shallowRef host node, post-flush snap-back watch): the value prop as a
// strict boolean, the native onChange -> onValueChange derivation, the controlled snap-back (a rejected
// toggle commands the JS value back down via setValue), and — the point this file exists to
// guard — that v-model (modelValue/update:modelValue) drives BOTH the render AND the snap-back
// watch identically to the plain value/onValueChange path: a second read site that misses
// resolveModelValue is a silent bug, not a build error.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Switch, mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

type ICommandCall = {
  name: string;
  args: readonly unknown[];
};

const ROOT_TAG = 320;
const SWITCH_VIEW = 'Switch';

const commands: ICommandCall[] = [];

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function switchNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SWITCH_VIEW);
  expect(node, `a ${SWITCH_VIEW} was created`).toBeDefined();
  if (node === undefined) throw new Error('unreachable: Switch missing');
  return node;
}

describe('Vue Switch on the engine', () => {
  it('passes value through as a strict boolean', async () => {
    mount(ROOT_TAG, defineComponent({ setup: () => () => h(Switch, { value: true }) }));
    await tick();
    expect(switchNode().props.value).toBe(true);
  });

  it('snaps native back via setValue when a rejected toggle is driven by value/onValueChange', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        // value is pinned false; onValueChange deliberately ignores the reported value.
        setup: () => () => h(Switch, { value: false, onValueChange: () => {} }),
      }),
    );
    await tick();
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();

    const setValue = commands.find(c => c.name === 'setValue');
    expect(setValue, 'a setValue command after a rejected toggle').toBeDefined();
    expect(setValue!.args[0]).toBe(false);
  });

  it('accepts modelValue as an alias for value, never forwarding it to Fabric', async () => {
    mount(ROOT_TAG, defineComponent({ setup: () => () => h(Switch, { modelValue: true }) }));
    await tick();

    const node = switchNode();
    expect(node.props.value).toBe(true);
    expect('modelValue' in node.props, 'modelValue must not reach Fabric').toBe(false);
  });

  it('emits update:modelValue and update:value alongside valueChange', async () => {
    let modelValueUpdate: boolean | undefined;
    let valueUpdate: boolean | undefined;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Switch, {
            modelValue: false,
            'onUpdate:modelValue': (value: boolean) => {
              modelValueUpdate = value;
            },
            'onUpdate:value': (value: boolean) => {
              valueUpdate = value;
            },
          }),
      }),
    );
    await tick();
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();
    expect(modelValueUpdate).toBe(true);
    expect(valueUpdate).toBe(true);
  });

  it('snaps native back via setValue on a rejected toggle driven by v-model, not just value', async () => {
    // Regression case for the read-every-site gotcha: the snap-back watch must resolve
    // modelValue too, not only the raw `value` attr — otherwise this renders fine but the
    // correction silently compares against an undefined value and never fires.
    mount(
      ROOT_TAG,
      defineComponent({
        // modelValue is pinned false; the update handler deliberately ignores the toggle.
        setup: () => () => h(Switch, { modelValue: false, 'onUpdate:modelValue': () => {} }),
      }),
    );
    await tick();
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();

    const setValue = commands.find(c => c.name === 'setValue');
    expect(setValue, 'a setValue command after a v-model-driven rejected toggle').toBeDefined();
    expect(setValue!.args[0]).toBe(false);
  });

  // why: shouldSnapBack only fires when the JS value DISAGREES with what native reported — a
  // parent that accepts the toggle (its handler re-pushes `value` to match) must NOT issue an
  // imperative correction. Without this case, "a command was dispatched" alone can't tell a
  // real snap-back apart from a bug that commands setValue on every change.
  it('does not command setValue when the parent accepts the toggle', async () => {
    const currentValue = ref(false);
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Switch, {
            value: currentValue.value,
            onValueChange: (next: boolean) => {
              currentValue.value = next;
            },
          }),
      }),
    );
    await tick();
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    await tick();

    expect(commands.find(c => c.name === 'setValue'), 'no correction for an accepted toggle').toBeUndefined();
  });

  // why: HANDLED_ATTRS' whole reason to exist — onValueChange is plain JS, not a Fabric
  // ViewConfig prop; leaking it into the native prop bag crashes Android's folly::dynamic
  // serializer the moment it tries to stringify a function.
  it('never forwards onValueChange itself onto the native prop bag', async () => {
    mount(
      ROOT_TAG,
      defineComponent({ setup: () => () => h(Switch, { value: false, onValueChange: () => {} }) }),
    );
    await tick();
    expect('onValueChange' in switchNode().props).toBe(false);
  });

  // why: trackColor/thumbColor/ios_backgroundColor are real ViewConfig props on the native
  // Switch, resolved through their own runtime guards (normalizeTrackColor/asString) into the
  // PLATFORM-SPECIFIC prop names renderSwitch actually emits (iOS: onTintColor/tintColor/
  // thumbTintColor, ios_backgroundColor folded into style) — a guard that silently drops a
  // valid value would make theming break invisibly instead of at compile time.
  it('resolves trackColor/thumbColor/ios_backgroundColor onto the native prop bag', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Switch, {
            value: false,
            disabled: true,
            trackColor: { false: '#111', true: '#222' },
            thumbColor: '#333',
            ios_backgroundColor: '#444',
          }),
      }),
    );
    await tick();
    const props = switchNode().props;
    expect(props.disabled).toBe(true);
    // iOS platform mapping (index.ios.ts): trackColor.true -> onTintColor, .false -> tintColor.
    expect(props.onTintColor).toBe('#222');
    expect(props.tintColor).toBe('#111');
    expect(props.thumbTintColor).toBe('#333');
    // ios_backgroundColor folds into style as the pill behind the shrunken track; the engine
    // flattens the resolved style object's keys directly onto the committed props.
    expect(props.backgroundColor).toBe('#444');
  });

  // why: an uncontrolled Switch (neither `value` nor `modelValue` set) is a legitimate mount
  // shape, not a caller error — resolveModelValue's `=== true` coercion must land on `false`,
  // not `undefined`/a crash, so the native Switch always mounts with a real boolean.
  it('defaults to false when neither value nor modelValue is set', async () => {
    mount(ROOT_TAG, defineComponent({ setup: () => () => h(Switch) }));
    await tick();
    expect(switchNode().props.value).toBe(false);
  });

  // why: valueFromChange returns undefined for a native event carrying no boolean `value` —
  // the adapter's `if (next === undefined) return;` guard must swallow that instead of
  // emitting a bogus value or crashing on `String(undefined.eventCount)`-style access.
  it('ignores a native change event with no boolean value, emitting nothing', async () => {
    let emitted: unknown;
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(Switch, { value: false, onValueChange: (next: boolean) => (emitted = next) }),
      }),
    );
    await tick();
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', {});
    await tick();
    expect(emitted).toBeUndefined();
  });
});
