// Switch's prop semantics, in the engine — the third behavior fold to move, and the first whose
// authored names are ALL invented. `trackColor`, `thumbColor` and `ios_backgroundColor` are not
// Fabric props at all: RN's Switch view declares `onTintColor`/`tintColor` on iOS,
// `trackColorFor*`/`trackTintColor` on Android, plus `thumbTintColor` on both. A wrapper body took
// those per-platform NAMES from an adapter-supplied table; a tag has no adapter to ask.
//
// So this is UA behavior by the same criterion as the two before it — `Switch.js` does it for every
// Switch in every app, and the answer depends only on the tag and the platform.
//
// WHAT STAYED IN JS: the machine. The snap-back handshake — native reports a toggle, the app either
// accepts it or does not, and a microtask later the disagreement is corrected with an imperative
// command. That reads app state and calls back into app code, so it stays where a browser keeps it.
//
// NO TWIN: `switch.ts` keeps no `foldPayload`, and `fabric-props.ts` gets no copy.

import { registerSwitchBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;
// The iOS Fabric name, which is what the headless `component-names` table resolves to. Android
// spells it `AndroidSwitch`, and that difference is the reason the rule below has a platform branch
// at all.
const SWITCH_VIEW = 'Switch';

registerSwitchBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

function commit(props: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(SWITCH_VIEW, false, 'switch');
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('the switch committed no payload');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

describe('what a switch sends native, resolved by the engine', () => {
  // why: THE PRICE. Every case below would pass with the rule still in a JS closure; this is the
  // one that says it moved.
  it('costs no trip into JS at all', () => {
    const plain = commit({ value: true });
    print(`DEBUG switch folds=${plain.folds}`);
    print(`payload keys: ${Object.keys(plain.payload).sort().join(' ')}`);
    expect(plain.folds).toBe(0);

    const loaded = commit({
      value: true,
      trackColor: { false: '#ff0000', true: '#00ff00' },
      thumbColor: '#0000ff',
      ios_backgroundColor: '#123456',
    });
    expect(loaded.folds).toBe(0);
  });

  // why: `value === true`, not a passthrough. Switch.js:280 coerces on both platforms, because the
  // native prop is a boolean and an authored `undefined` must read as OFF rather than as "no value"
  // — an uncontrolled switch that paints on is worse than one that paints off.
  it('coerces the value to a real boolean', () => {
    expect(commit({ value: true }).payload.value).toBe(true);
    expect(commit({ value: false }).payload.value).toBe(false);
    expect(commit({}).payload.value).toBe(false);
    expect(commit({ value: 'yes' }).payload.value).toBe(false);
  });

  // why: the three authored names are the whole reason this fold exists, and none of them is a
  // Fabric prop. Leaving one in the payload is how a reader concludes the fold ran when it did not.
  it('does not send the authored names, which native does not know', () => {
    const payload = commit({
      value: true,
      trackColor: { false: '#ff0000', true: '#00ff00' },
      thumbColor: '#0000ff',
      ios_backgroundColor: '#123456',
    }).payload;

    expect(payload.trackColor).toBe(undefined);
    expect(payload.thumbColor).toBe(undefined);
    expect(payload.ios_backgroundColor).toBe(undefined);
  });

  // why: Switch.js:264,278 — on iOS the track colours become `onTintColor` (the ON track) and
  // `tintColor` (the OFF track). Getting them the wrong way round paints a switch that reads as its
  // own opposite, which no test of shape would notice.
  it('resolves the track colours onto the iOS names', () => {
    const payload = commit({
      value: true,
      trackColor: { false: '#ff0000', true: '#00ff00' },
    }).payload;

    expect(payload.onTintColor).toBe(0xff_00_ff_00);
    expect(payload.tintColor).toBe(0xff_ff_00_00);
  });

  // why: Switch.js:279 — `thumbColor` is the authored name and `thumbTintColor` the native one, on
  // both platforms. The one rename that is NOT platform-split.
  it('renames thumbColor to the native thumbTintColor', () => {
    const payload = commit({ value: false, thumbColor: '#0000ff' }).payload;

    expect(payload.thumbTintColor).toBe(0xff_00_00_ff);
  });

  // why: Switch.js:266-276 — `ios_backgroundColor` is not a prop, it is a STYLE. RN composes it as
  // a background plus a 16pt radius so the pill shows through the translucent track.
  it('folds ios_backgroundColor into the style, with RN s radius', () => {
    const payload = commit({
      value: false,
      style: { margin: 4 },
      ios_backgroundColor: '#123456',
    }).payload;

    expect(payload.margin).toBe(4);
    expect(payload.backgroundColor).toBe(0xff_12_34_56);
    expect(payload.borderRadius).toBe(16);
  });

  // why: and it must not invent one when the app did not ask. A switch with no
  // `ios_backgroundColor` has no background of its own — the track is the control.
  it('adds no background when none was authored', () => {
    const payload = commit({ value: false, style: { margin: 4 } }).payload;

    expect(payload.backgroundColor).toBe(undefined);
    expect(payload.borderRadius).toBe(undefined);
  });

  // THREE DIVERGENCES FROM RN, FOUND BY READING `Switch.js` WHILE PORTING AND NOT FIXED HERE.
  // The port is a MOVE — same rule, new house — so that a measurement and a regression both stay
  // attributable to it. Each of these is a separate change with its own before/after.
  //
  //   [characterization — behavior not confirmed]
  //   QUESTION: `accessibilityRole` defaults to `'switch'` in RN on BOTH platforms
  //   (`Switch.js:293` and `:255`, `props.accessibilityRole ?? 'switch'`). We emit nothing, so a
  //   screen reader announces our switch as a plain view. Same class of silent a11y gap that
  //   `accessible`/`focusable` were on Pressable before 2026-09-09.
  //
  //   [characterization — behavior not confirmed]
  //   QUESTION: iOS composes `{alignSelf: 'flex-start'}` UNDER the app's style (`Switch.js:266`),
  //   so a stock Switch does not stretch to its container's cross-axis. We omit it, so ours does.
  //
  //   [characterization — behavior not confirmed]
  //   QUESTION: Android's native prop names are `on` and `enabled` (`Switch.js:240-241`), not
  //   `value` and `disabled`; and `_disabled` there resolves through `accessibilityState.disabled`
  //   first. We send `value`/`disabled` on both platforms. Unobservable from this build — the
  //   assertions above are the iOS branch — which is exactly why it is written down rather than
  //   left to a device.
  it('pins the three RN divergences this port did NOT change', () => {
    const payload = commit({ value: true, style: { margin: 4 } }).payload;

    expect(payload.accessibilityRole).toBe(undefined);
    expect(payload.alignSelf).toBe(undefined);
  });

  // why: THE CONTROL. Every absence assertion above would be satisfied by a payload with no rule at
  // all, so pin that the same props on a behaviorless tag are untouched.
  it('folds nothing on a tag with no behavior', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement(SWITCH_VIEW, false, 'view');
    setProp(node, 'value', 'yes');
    setProp(node, 'thumbColor', '#0000ff');
    surface.appendChild(node);
    surface.commit();
    mounted();

    const payload = committedPayloadOf(node);
    if (payload === undefined) throw new Error('nothing committed');
    expect(payload.value).toBe('yes');
    expect(payload.thumbTintColor).toBe(undefined);
    // A SHARPER CONTROL THAN INTENDED, and worth keeping for what it shows: the authored name rides
    // through as the STRING it was written as, un-parsed. Colour conversion is keyed on the NATIVE
    // names (`kColorProps`), so `thumbColor` is not a colour to this engine — which is another way
    // of saying the rename is the rule, not a formality.
    expect(payload.thumbColor).toBe('#0000ff');
  });
});

report();
