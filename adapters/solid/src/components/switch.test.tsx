// Solid twin of adapters/react/src/components/switch/switch.test.tsx and the Vue/Svelte ones.
// Drives REAL compiled Solid JSX (the vitest `solid` project runs the same babel-preset-solid
// options the app-facing babel-preset.cjs pins) through the universal renderer into the fake Fabric
// slot: the Fabric view name, the strict-boolean value fold, the color/accessibility prop mapping,
// the onValueChange derivation, and the controlled snap-back.
//
// THE SUBJECT IS THE BARE TAG — there is no Switch component any more. Two cases still have no
// counterpart in the React file: a Solid prop is an accessor read where it is used, so "the value
// prop updates after mount" and "the snap-back watches the CURRENT value" remain real,
// silently-breakable claims about this adapter's wiring rather than tautologies.
//
// Negative group: a native change payload that carries no boolean.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: the controlled handshake lives in the tag's behavior, and only this module
// installs it. An app reaches it through the package barrel; a test importing render does not.
import '../register';
import { mount, unmount } from '../render';
// SIDE-EFFECT IMPORT, and the suite is worthless without it: the value fold, the track-colour
// mapping and the snap-back all reach `<switch>` through `registerSwitchBehavior`.

const ROOT_TAG = 812;
const SWITCH_VIEW = 'Switch';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// SCOPED TO ONE NODE, and that is not tidiness. The machine lives on the engine node now, and a
// behavior declaring `afterCommit` is held in a process-wide set until it is swept
// (`core/engine/src/host-behavior.ts`, `committedEachTime`). `unmount` disposes the surface's root
// container without a removal commit, so an earlier test's switch is never swept and keeps
// evaluating its snap-back on every LATER commit in the process — reported as an engine finding.
// A whole-log assertion therefore reads those as commands of the case under test. Each command
// case below carries its own testID so the oracle names the node it is about.
function commandsFor(testId: string): readonly string[] {
  return fabric.commands
    .filter(command => fabric.propsOf(command.handle).testID === testId)
    .map(command => `${command.commandName}:${JSON.stringify(command.args)}`);
}

// The live tree re-derives on every read, so anything asserted after an update is safe off it —
// no more "frozen at first commit" caveat.
function committedSwitch(): ILiveNode {
  const found = live.findLive(live.appRoot(), n => n.viewName === SWITCH_VIEW);
  if (found === undefined) throw new Error(`no ${SWITCH_VIEW} was committed`);
  return found;
}

function createdSwitch(): { instanceHandle: unknown } {
  const node = fabric.find(n => n.viewName === SWITCH_VIEW);
  if (node === undefined) throw new Error(`no ${SWITCH_VIEW} was created`);
  return node;
}

describe('Solid Switch on the engine', () => {
  describe('Positive', () => {
    // why: RN's real Switch view name is `Switch` — a wrong native view name means the host never
    // resolves a component, which no JS-level check would otherwise catch.
    it('emits the Fabric view name Switch and carries the authored props through', async () => {
      mount(ROOT_TAG, () => <switch value disabled />);
      await tick();

      expect(committedSwitch().viewName).toBe('Switch');
      expect(committedSwitch().payload.disabled).toBe(true);
    });

    // THE PROP-RESOLUTION CASES MOVED, as a GROUP:
    // `core/engine/cpp/tests/js/switch-payload.itest.ts`. `value === true`, the per-platform colour
    // renames and the `ios_backgroundColor` style fold are `foldSwitchProps` in
    // `SymbioteFabricProps.cpp` now, and this harness commits through the TypeScript `fabricProps`,
    // which holds no copy of that rule.
    //
    // They travelled together on purpose. The `<switch value />` case above would have stayed GREEN
    // on its own — the app authored `true`, so a payload with no rule at all satisfies it — and a
    // green case over a rule that no longer runs is worse than no case. It is renamed to what it
    // still proves: the tag picks the right Fabric view and the authored props reach the commit.
    //
    // One claim went with them and is now unreachable BY CONSTRUCTION, which is worth recording:
    // this file used to pin that `onTintColor` reaches Fabric as a PROP rather than being mistaken
    // for a listener, because `routeProp` asks the Switch ViewConfig instead of guessing from the
    // `on` prefix. The engine writes that name into the payload directly now, so `routeProp` never
    // sees it and the hazard cannot occur. The authored name it DOES see is `trackColor`.

    // why: native reads only `accessibility*`; the web aliases must be folded in JS before commit
    // (RN's own View.js transform). Switch owns its host element rather than rendering through a
    // View, so the fold is the component's own job — skipping it would leave `aria-label` riding to
    // Fabric as a meaningless prop and the switch unlabelled for a screen reader.
    it('folds aria aliases into the canonical accessibility props', async () => {
      mount(ROOT_TAG, () => (
        <switch value={false} aria-label="wifi" aria-disabled />
      ));
      await tick();

      const payload = committedSwitch().payload;
      expect(payload.accessibilityLabel).toBe('wifi');
      expect(payload.accessibilityState).toEqual({ disabled: true });
    });

    // why: onValueChange hands the caller ONE event, with the derived boolean carried as
    // `.value` — a consumer reading `event.nativeEvent.value` (RN's own event shape) must still
    // work.
    it('derives onValueChange with both the value and the raw event', async () => {
      let changedValue: boolean | undefined;
      let rawEventValue: unknown;
      mount(ROOT_TAG, () => (
        <switch
          value={false}
          onValueChange={event => {
            changedValue = event.value;
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
      // The handler above does not move `value`, so the behavior's deferred snap-back is CORRECT
      // and still pending. Draining it here rather than letting it land in the next test: it is
      // scheduled on a microtask by the machine itself, so nothing about unmounting cancels it,
      // and a stray `setValue` arriving after `fabric.reset()` reads as a spurious command in a
      // test that never toggled anything.
      await tick();
    });

    // why: onValueChange is plain JS, not a ViewConfig prop — leaking it onto the native prop bag
    // crashes Android's folly::dynamic serializer the moment it tries to stringify a function.
    it('never forwards onValueChange itself onto the native prop bag', async () => {
      mount(ROOT_TAG, () => <switch value={false} onValueChange={() => {}} />);
      await tick();
      expect('onValueChange' in committedSwitch().payload).toBe(false);
    });

    // why: Solid runs a component body ONCE. Every prop read here sits inside an accessor precisely
    // so a later change still reaches the host node; a single destructure in the component would
    // freeze the Switch at its mount-time value while every other test in this file still passed.
    it('re-commits the same native node when the parent updates value after mount', async () => {
      const [value, setValue] = createSignal(false);
      mount(ROOT_TAG, () => <switch value={value()} />);
      await tick();
      const hostAtMount = committedSwitch().handle;
      expect(committedSwitch().payload.value).toBe(false);

      setValue(true);
      await tick();

      expect(committedSwitch().payload.value).toBe(true);
      expect(committedSwitch().handle, 'the host node kept its identity').toBe(
        hostAtMount,
      );
    });

    // why: shouldSnapBack only fires once native has actually reported (lastNativeReport !== null) —
    // the mount-time effect run must not misread the pre-report `null` as a disagreement and issue a
    // spurious command before any real toggle.
    it('issues no snap-back command on initial mount', async () => {
      mount(ROOT_TAG, () => (
        <switch testID="mount-probe" value onValueChange={() => {}} />
      ));
      await tick();
      expect(commandsFor('mount-probe')).toEqual([]);
    });

    // why: native flips its own grip optimistically before JS approves — with a no-op handler the
    // `value` prop never changes, so the retained tree never diverges and nothing re-commits. The
    // imperative setValue command is the ONLY path that corrects native.
    it('snaps native back via setValue when a no-op handler rejects the toggle', async () => {
      const [value] = createSignal(false);
      mount(ROOT_TAG, () => (
        <switch
          testID="reject-probe"
          value={value()}
          onValueChange={() => {}}
        />
      ));
      await tick();

      fabric.fireEvent(createdSwitch().instanceHandle, 'topChange', {
        value: true,
      });
      await tick();

      expect(commandsFor('reject-probe')).toEqual(['setValue:[false]']);
    });

    // why: the counterpart — an always-fire snap-back would fight every legitimate toggle right
    // after it succeeded. This also proves the effect reads the CURRENT value: it only stays silent
    // if the accessor sees the parent's updated signal, not the mount-time one.
    it('issues no snap-back command when the parent accepts the toggle', async () => {
      const [value, setValue] = createSignal(false);
      mount(ROOT_TAG, () => (
        <switch
          testID="accept-probe"
          value={value()}
          onValueChange={event => setValue(event.value)}
        />
      ));
      await tick();

      fabric.fireEvent(createdSwitch().instanceHandle, 'topChange', {
        value: true,
      });
      await tick();

      expect(committedSwitch().payload.value).toBe(true);
      expect(commandsFor('accept-probe')).toEqual([]);
    });
  });

  describe('Negative', () => {
    // why: valueFromChange narrows nativeEvent.value to a strict boolean — a malformed payload must
    // be silently ignored (no callback, no reducer dispatch, no command), never forwarded to the
    // caller as if it were a real toggle.
    it('ignores a change event whose nativeEvent.value is not a boolean', async () => {
      let calls = 0;
      mount(ROOT_TAG, () => (
        <switch
          testID="ignore-probe"
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
      expect(commandsFor('ignore-probe')).toEqual([]);
    });
  });
});
