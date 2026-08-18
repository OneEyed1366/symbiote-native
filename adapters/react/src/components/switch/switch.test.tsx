// Proves the Switch primitive: the Fabric view name `Switch`, the
// `value` prop as a strict boolean, the trackColor/thumbColor/ios_backgroundColor ->
// native prop mapping, onValueChange's (value, event) derivation from nativeEvent.value,
// and the controlled snap-back: a rejected toggle commands the JS value back down via
// a `setValue` view command. No simulator: a failure here is in JS, not native.
//
// SCOPE: `switchReducer`/`valueFromChange`/`shouldSnapBack` (core/components/src/state/switch.ts)
// have NO co-located core-level unit test anywhere in the repo (confirmed by grep — only this
// file, the Vue adapter test, and the Svelte smoke test exercise them). This file is therefore
// not pure React-wiring coverage: together with those two siblings it is the only proof the
// shared controlled-toggle/snap-back state machine actually behaves per the product rule above,
// not merely that useSwitchLogic calls into it. No Negative group: switchReducer's action union
// has exactly one variant (exhaustive switch, no throwing default) and nothing else here rejects.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, Switch } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

interface ICommandCall {
  name: string;
  args: readonly unknown[];
}

const ROOT_TAG = 190;
const SWITCH_VIEW = 'Switch';

const commands: ICommandCall[] = [];

// The shared harness slot doesn't record view commands; the snap-back cases assert the
// `setValue` command, so graft a recording `dispatchCommand` onto the live slot before any
// mount (the engine destructures it off the global on its first commit).
const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.dispatchCommand = (_node, name, args) => {
  commands.push({ name, args });
};

beforeEach(() => {
  fabric.reset();
  commands.length = 0;
});
afterEach(() => unmount(ROOT_TAG));

function switchNode(): IFakeNode {
  const node = fabric.find(n => n.viewName === SWITCH_VIEW);
  if (!node) throw new Error(`no ${SWITCH_VIEW} was created`);
  return node;
}

describe('React Switch on the engine', () => {
  // why: RN's real Switch view name is `Switch` — a wrong native view name means the host
  // simply never resolves a component, which no JS-level check would otherwise catch.
  it('emits the Fabric view name Switch and passes value through as a strict boolean', () => {
    mount(ROOT_TAG, <Switch value />);
    expect(switchNode().props.value).toBe(true);
  });

  // why: RN sends `value === true` to the native side (Switch.js) — an absent `value` prop must
  // fold to a real `false`, not ride through as `undefined`, which native would reject/misread.
  it('folds an undefined value to a strict false', () => {
    mount(ROOT_TAG, <Switch />);
    expect(switchNode().props.value).toBe(false);
  });

  // why: trackColor/thumbColor/ios_backgroundColor are RN's public prop names, but native reads
  // them under different keys (onTintColor/tintColor/thumbTintColor/backgroundColor) — using the
  // public names on the wire would just silently not paint on device.
  it('maps color + disabled props to the native iOS prop names', () => {
    mount(
      ROOT_TAG,
      <Switch
        value
        disabled
        trackColor={{ false: '#767577', true: '#81b0ff' }}
        thumbColor="#f5dd4b"
        ios_backgroundColor="#3e3e3e"
      />,
    );
    const props = switchNode().props;
    expect(props.onTintColor).toBe('#81b0ff');
    expect(props.tintColor).toBe('#767577');
    expect(props.thumbTintColor).toBe('#f5dd4b');
    expect(props.disabled).toBe(true);
    // ios_backgroundColor folds into the style, which the commit engine flattens onto the
    // node, so backgroundColor lands as a top-level committed prop.
    expect(props.backgroundColor).toBe('#3e3e3e');
  });

  // why: RN's onValueChange hands the caller both the derived boolean and the raw event — a
  // consumer that only reads `event.nativeEvent.value` (RN's older pattern) must still work.
  it('derives onValueChange with both the value and the raw event from nativeEvent.value', () => {
    let changedValue: boolean | undefined;
    let rawEventValue: unknown;
    mount(
      ROOT_TAG,
      <Switch
        value={false}
        onValueChange={(v, event) => {
          changedValue = v;
          rawEventValue = event.nativeEvent.value;
        }}
      />,
    );
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });
    expect(changedValue).toBe(true);
    expect(rawEventValue).toBe(true);
  });

  // why: valueFromChange narrows nativeEvent.value to a strict boolean — a malformed change
  // payload (not a boolean) must be silently ignored (no callback, no reducer dispatch), never
  // crash or forward garbage to the caller as if it were a real toggle.
  it('ignores a change event whose nativeEvent.value is not a boolean', () => {
    let calls = 0;
    mount(
      ROOT_TAG,
      <Switch
        value={false}
        onValueChange={() => {
          calls++;
        }}
      />,
    );
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', {
      value: 'not-a-boolean',
    });
    expect(calls).toBe(0);
    // and no snap-back command either — the reducer never saw a report to disagree with.
    expect(commands.some(c => c.name === 'setValue')).toBe(false);
  });

  // why: shouldSnapBack only fires once native has actually reported a value (lastNativeReport
  // !== null) — the initial mount's own useLayoutEffect run must not misread the pre-report
  // `null` state as a disagreement and issue a spurious snap-back before any real toggle happened.
  it('issues no snap-back command on initial mount, before any native report', () => {
    mount(ROOT_TAG, <Switch value onValueChange={() => {}} />);
    expect(commands.some(c => c.name === 'setValue')).toBe(false);
  });

  // why: native flips its own visual grip optimistically before JS approves — if the parent's
  // onValueChange is a no-op, the `value` prop never changes, so a plain prop re-push can't
  // correct native; the ONLY way to un-stick it is the imperative setValue command.
  it('snaps native back via a setValue command when a no-op handler rejects the toggle', () => {
    function Stuck(): ReactElement {
      // value is pinned false; the handler deliberately ignores the new value.
      const [value] = useState(false);
      return <Switch value={value} onValueChange={() => {}} />;
    }
    mount(ROOT_TAG, <Stuck />);
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });

    const setValue = commands.find(c => c.name === 'setValue');
    expect(
      setValue,
      'a setValue command after a rejected toggle',
    ).toBeDefined();
    expect(setValue!.args[0]).toBe(false);
  });

  // why: the counterpart to the case above — when the parent DOES accept the toggle (value
  // catches up with native's report), the effect must recognize agreement and stay silent; an
  // always-fire snap-back would fight every legitimate toggle right after it succeeds.
  it('issues no snap-back command when the parent accepts the toggle', () => {
    function Accepting(): ReactElement {
      const [value, setValue] = useState(false);
      return <Switch value={value} onValueChange={setValue} />;
    }
    mount(ROOT_TAG, <Accepting />);
    fabric.fireEvent(switchNode().instanceHandle, 'topChange', { value: true });

    expect(commands.some(c => c.name === 'setValue')).toBe(false);
  });
});
