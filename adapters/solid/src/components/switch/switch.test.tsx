// Solid twin of adapters/react/src/components/switch/switch.test.tsx and the Vue/Svelte ones.
// Drives REAL compiled Solid JSX (the vitest `solid` project runs the same babel-preset-solid
// options the app-facing babel-preset.cjs pins) through the universal renderer into the fake Fabric
// slot: the Fabric view name, the strict-boolean value fold, the color/accessibility prop mapping,
// the onValueChange derivation, and the controlled snap-back.
//
// Two cases have no counterpart in the React file and exist because Solid's lifecycle is the one
// thing NOT shared with it: props are getters read once unless every read sits inside an accessor,
// so "the value prop updates after mount" and "the snap-back watches the CURRENT value" are real,
// silently-breakable claims here, not tautologies.
//
// Negative group: a native change payload that carries no boolean.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { Switch } from './index';

const ROOT_TAG = 812;
const SWITCH_VIEW = 'Switch';
const TRACK_ON = '#81b0ff';
const TRACK_OFF = '#767577';
const THUMB = '#f5dd4b';
const IOS_BACKGROUND = '#3e3e3e';

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

// The created node's props are frozen at first commit (clone-on-write hands back a new object), so
// anything asserted after an update must be read off the live committed tree.
function committedSwitch(): IFakeNode {
  let found: IFakeNode | undefined;
  walk(fabric.committed, node => {
    if (node.viewName === SWITCH_VIEW) found = node;
  });
  if (found === undefined) throw new Error(`no ${SWITCH_VIEW} was committed`);
  return found;
}

function createdSwitch(): IFakeNode {
  const node = fabric.find(n => n.viewName === SWITCH_VIEW);
  if (node === undefined) throw new Error(`no ${SWITCH_VIEW} was created`);
  return node;
}

describe('Solid Switch on the engine', () => {
  describe('Positive', () => {
    // why: RN's real Switch view name is `Switch` — a wrong native view name means the host never
    // resolves a component, which no JS-level check would otherwise catch.
    it('emits the Fabric view name Switch and passes value through as a strict boolean', async () => {
      mount(ROOT_TAG, () => <Switch value />);
      await tick();
      expect(committedSwitch().props.value).toBe(true);
    });

    // why: RN sends `value === true` to native (Switch.js) — an absent `value` must fold to a real
    // `false`, not ride through as `undefined`, which native would misread.
    it('folds an undefined value to a strict false', async () => {
      mount(ROOT_TAG, () => <Switch />);
      await tick();
      expect(committedSwitch().props.value).toBe(false);
    });

    // why: trackColor/thumbColor/ios_backgroundColor are RN's public prop names, but native reads
    // them under different keys — using the public names on the wire silently fails to paint. This
    // also pins the one prop whose NAME lies about its kind: `onTintColor` must reach Fabric as a
    // PROP, and does, because routeProp asks the Switch ViewConfig (whose only event is `change`)
    // instead of guessing from an `on` prefix.
    it('maps color + disabled props to the native iOS prop names', async () => {
      mount(ROOT_TAG, () => (
        <Switch
          value
          disabled
          trackColor={{ false: TRACK_OFF, true: TRACK_ON }}
          thumbColor={THUMB}
          ios_backgroundColor={IOS_BACKGROUND}
        />
      ));
      await tick();

      const props = committedSwitch().props;
      expect(props.onTintColor).toBe(TRACK_ON);
      expect(props.tintColor).toBe(TRACK_OFF);
      expect(props.thumbTintColor).toBe(THUMB);
      expect(props.disabled).toBe(true);
      // ios_backgroundColor folds into the style, which the engine flattens onto the node, so
      // backgroundColor lands as a top-level committed prop.
      expect(props.backgroundColor).toBe(IOS_BACKGROUND);
    });

    // why: native reads only `accessibility*`; the web aliases must be folded in JS before commit
    // (RN's own View.js transform). Switch owns its host element rather than rendering through a
    // View, so the fold is the component's own job — skipping it would leave `aria-label` riding to
    // Fabric as a meaningless prop and the switch unlabelled for a screen reader.
    it('folds aria aliases into the canonical accessibility props', async () => {
      mount(ROOT_TAG, () => (
        <Switch value={false} aria-label="wifi" aria-disabled />
      ));
      await tick();

      const props = committedSwitch().props;
      expect(props.accessibilityLabel).toBe('wifi');
      expect(props.accessibilityState).toEqual({ disabled: true });
    });

    // why: RN's onValueChange hands the caller both the derived boolean and the raw event — a
    // consumer reading `event.nativeEvent.value` (RN's older pattern) must still work.
    it('derives onValueChange with both the value and the raw event', async () => {
      let changedValue: boolean | undefined;
      let rawEventValue: unknown;
      mount(ROOT_TAG, () => (
        <Switch
          value={false}
          onValueChange={(next, event) => {
            changedValue = next;
            rawEventValue = event.nativeEvent.value;
          }}
        />
      ));
      await tick();

      fabric.fireEvent(createdSwitch().instanceHandle, 'topChange', {
        value: true,
      });
      expect(changedValue).toBe(true);
      expect(rawEventValue).toBe(true);
    });

    // why: onValueChange is plain JS, not a ViewConfig prop — leaking it onto the native prop bag
    // crashes Android's folly::dynamic serializer the moment it tries to stringify a function.
    it('never forwards onValueChange itself onto the native prop bag', async () => {
      mount(ROOT_TAG, () => <Switch value={false} onValueChange={() => {}} />);
      await tick();
      expect('onValueChange' in committedSwitch().props).toBe(false);
    });

    // why: Solid runs a component body ONCE. Every prop read here sits inside an accessor precisely
    // so a later change still reaches the host node; a single destructure in the component would
    // freeze the Switch at its mount-time value while every other test in this file still passed.
    it('re-commits the same native node when the parent updates value after mount', async () => {
      const [value, setValue] = createSignal(false);
      mount(ROOT_TAG, () => <Switch value={value()} />);
      await tick();
      const createdAtMount = fabric.counts.createNode;
      expect(committedSwitch().props.value).toBe(false);

      setValue(true);
      await tick();

      expect(committedSwitch().props.value).toBe(true);
      expect(fabric.counts.createNode, 'the host node kept its identity').toBe(
        createdAtMount,
      );
    });

    // why: shouldSnapBack only fires once native has actually reported (lastNativeReport !== null) —
    // the mount-time effect run must not misread the pre-report `null` as a disagreement and issue a
    // spurious command before any real toggle.
    it('issues no snap-back command on initial mount', async () => {
      mount(ROOT_TAG, () => <Switch value onValueChange={() => {}} />);
      await tick();
      expect(fabric.commands).toHaveLength(0);
    });

    // why: native flips its own grip optimistically before JS approves — with a no-op handler the
    // `value` prop never changes, so the retained tree never diverges and nothing re-commits. The
    // imperative setValue command is the ONLY path that corrects native.
    it('snaps native back via setValue when a no-op handler rejects the toggle', async () => {
      const [value] = createSignal(false);
      mount(ROOT_TAG, () => (
        <Switch value={value()} onValueChange={() => {}} />
      ));
      await tick();

      fabric.fireEvent(createdSwitch().instanceHandle, 'topChange', {
        value: true,
      });
      await tick();

      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('setValue');
      expect(fabric.commands[0]?.args).toEqual([false]);
    });

    // why: the counterpart — an always-fire snap-back would fight every legitimate toggle right
    // after it succeeded. This also proves the effect reads the CURRENT value: it only stays silent
    // if the accessor sees the parent's updated signal, not the mount-time one.
    it('issues no snap-back command when the parent accepts the toggle', async () => {
      const [value, setValue] = createSignal(false);
      mount(ROOT_TAG, () => (
        <Switch value={value()} onValueChange={setValue} />
      ));
      await tick();

      fabric.fireEvent(createdSwitch().instanceHandle, 'topChange', {
        value: true,
      });
      await tick();

      expect(committedSwitch().props.value).toBe(true);
      expect(fabric.commands).toHaveLength(0);
    });
  });

  describe('Negative', () => {
    // why: valueFromChange narrows nativeEvent.value to a strict boolean — a malformed payload must
    // be silently ignored (no callback, no reducer dispatch, no command), never forwarded to the
    // caller as if it were a real toggle.
    it('ignores a change event whose nativeEvent.value is not a boolean', async () => {
      let calls = 0;
      mount(ROOT_TAG, () => (
        <Switch
          value={false}
          onValueChange={() => {
            calls++;
          }}
        />
      ));
      await tick();

      fabric.fireEvent(createdSwitch().instanceHandle, 'topChange', {
        value: 'not-a-boolean',
      });
      await tick();

      expect(calls).toBe(0);
      expect(fabric.commands).toHaveLength(0);
    });
  });
});
