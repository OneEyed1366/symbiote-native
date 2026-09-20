// The last three fold-only tags, in the engine — and the vendor read found two silent holes on the
// way, so this file is a port AND a fix.
//
// `touchable-opacity` and `touchable-highlight` each carried a `foldPayload` whose whole content
// was `id` -> `nativeID` (`TouchableOpacity.js:326`, `TouchableHighlight.js:375` — both spelled
// `nativeID={this.props.id ?? this.props.nativeID}`) and `accessible !== false` (`:303` / `:337`).
// Both are functions of the TAG, so both are the platform's and both move.
//
// THE TWO HOLES, and they are the same class as the Switch ones — invisible from this build's own
// assertions, only reachable by reading upstream beside the port:
//
//   1. TouchableHighlight folds `disabled` into `accessibilityState` exactly as TouchableOpacity
//      does (`TouchableHighlight.js:311-319`, `TouchableOpacity.js:279-285`) and OUR highlight
//      never did. A disabled highlight announced itself to a screen reader as enabled.
//   2. Neither touchable stripped the props its own machine CONSUMES — `activeOpacity`,
//      `underlayColor`, `onShowUnderlay`, `onHideUnderlay`, `delayPressIn`, `delayPressOut`. RN
//      forwards none of them to the View it renders; we forwarded all six, including two FUNCTIONS,
//      to a native view that declares none of them.
//
// `input-accessory-view`'s fold is the third, and porting it meant DELETING it. Read end to end it
// split the bag into consumed/passthrough and reassembled it — the only thing it changed was
// dropping a `nativeID` or `backgroundColor` that was not a string, which is defensive narrowing of
// a typed view object rather than a rule native cares about (and it dropped a NUMERIC colour, which
// `processColor` accepts). The tag commits the same payload with no fold and no rule, and pays no
// trip to find that out. A fold that exists to re-shape a typed object is not a behavior.
//
// WHAT STAYED IN JS, which is why the two touchables keep a `payloadFold` rather than losing it:
// their `tagFold` reads the NODE. `focusable`'s middle leg is `onPress !== undefined`
// (`:336` / `:370`) — an OWNED listener, so it lives in the stash and not in the bag — and the
// highlight underlay's style is built from live press state. Per-instance, not per-tag;
// composition, not platform.

import {
  registerInputAccessoryViewBehavior,
  registerTouchableHighlightBehavior,
  registerTouchableOpacityBehavior,
} from '@symbiote-native/components';

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

registerTouchableOpacityBehavior();
registerTouchableHighlightBehavior();
registerInputAccessoryViewBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

function commit(
  view: string,
  tag: string,
  props: Record<string, unknown>,
): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(view, false, tag);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

// One field out of a committed nested object, narrowed rather than cast. Reading fields is what
// this file does instead of `toEqual` on an object — see the merge case for why.
function fieldOf(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.hasOwn(value, name) ? Reflect.get(value, name) : undefined;
}

const opacity = (props: Record<string, unknown>): ICommitted =>
  commit('RCTView', 'touchable-opacity', props);
const highlight = (props: Record<string, unknown>): ICommitted =>
  commit('RCTView', 'touchable-highlight', props);
const accessory = (props: Record<string, unknown>): ICommitted =>
  commit('RCTInputAccessoryView', 'input-accessory-view', props);

describe('what the fold-only touchables send native', () => {
  // THE `id` ALIAS LEFT THIS FILE ON 2026-09-18, and it left because it stopped being a PAYLOAD
  // rule at all. It was `foldIdAlias` in the payload builder, keyed on the tag; it is `routeProp`'s
  // now, resolved on the way IN and for every node rather than only the ones carrying a behavior.
  // Seven implementations collapsed into that one — `core/engine/cpp/tests/js/id-alias-coverage.itest.ts`
  // holds the whole story and both cases that used to be here.
  //
  // This fixture could not keep them even as passthrough: it writes with `setProp`, which is the raw
  // write and skips routing entirely. That was invisible while the rule ran at commit time and is
  // the reason the cases went red the moment it moved — the same trap the ScrollView content fixture
  // and Button's title hit. An app reaches the engine through `routeProp`; a fixture that does not is
  // testing a path nothing takes.

  // why: `accessible={this.props.accessible !== false}` — accessible unless the app opts OUT, and
  // `!== false` rather than `?? true`, so only a literal false opts out.
  it('makes both accessible unless the app opts out', () => {
    expect(opacity({}).payload.accessible).toBe(true);
    expect(opacity({ accessible: false }).payload.accessible).toBe(false);
    expect(highlight({}).payload.accessible).toBe(true);
    expect(highlight({ accessible: false }).payload.accessible).toBe(false);
  });

  // why: HOLE 1. A screen reader reads `accessibilityState.disabled`, not the `disabled` prop, so a
  // disabled highlight that does not fold announced itself as enabled — the same silent class as
  // Switch's missing `accessibilityRole`. `!= null` and not truthiness: an explicit `disabled:
  // false` is a real announcement, so it is PRESENCE that decides.
  it('folds disabled into accessibilityState on the highlight too', () => {
    expect(
      fieldOf(
        highlight({ disabled: true }).payload.accessibilityState,
        'disabled',
      ),
    ).toBe(true);
    expect(
      fieldOf(
        highlight({ disabled: false }).payload.accessibilityState,
        'disabled',
      ),
    ).toBe(false);
  });

  // why: and it MERGES rather than replaces — an app that authored `busy` keeps it. Overwriting
  // would silently drop every other state flag the app set.
  it('merges the folded disabled over an authored accessibilityState', () => {
    const state = highlight({
      disabled: true,
      accessibilityState: { busy: true, disabled: false },
    }).payload.accessibilityState;

    // Field by field rather than `toEqual`: a `folly::dynamic` object does not preserve key order,
    // so a structural comparison fails on a payload that is correct. Arrays DO keep theirs and are
    // compared whole elsewhere — order is part of a style array's contract and not of an object's.
    expect(fieldOf(state, 'disabled')).toBe(true);
    expect(fieldOf(state, 'busy')).toBe(true);
  });

  // why: absent `disabled` writes nothing at all, so a touchable with no disabled prop does not
  // gain an `accessibilityState` it never had.
  it('leaves accessibilityState alone when disabled is absent', () => {
    expect(highlight({}).payload.accessibilityState).toBe(undefined);
  });

  // why: HOLE 2. RN forwards none of these to the View it renders — they are the feedback machine's
  // own input. Two of them are FUNCTIONS, and a function reaching a native prop bag is not a
  // cosmetic leak: it crosses the bridge as a value no ViewConfig declares.
  it('strips the props the feedback machine consumes', () => {
    const payload = highlight({
      underlayColor: '#000',
      activeOpacity: 0.5,
      onShowUnderlay: () => {},
      onHideUnderlay: () => {},
      delayPressIn: 10,
      delayPressOut: 20,
      touchSoundDisabled: true,
      rejectResponderTermination: true,
    }).payload;

    for (const consumed of [
      'underlayColor',
      'activeOpacity',
      'onShowUnderlay',
      'onHideUnderlay',
      'delayPressIn',
      'delayPressOut',
      'touchSoundDisabled',
      'rejectResponderTermination',
    ]) {
      expect(payload[consumed]).toBe(undefined);
    }
  });

  // why: THE CONTROL for the strip, and it is what makes it a fix rather than a hole of its own.
  // The underlay is built FROM `underlayColor` and `activeOpacity`, and the tag rule erases them
  // before the JS fold runs — so the fold has to read them off the NODE. If it still read the bag,
  // this style would silently lose its colour and every assertion above would still pass.
  it('still paints the underlay from the props it just stripped', () => {
    const style = highlight({
      underlayColor: '#ff0000',
      onPress: () => {},
      style: { padding: 4 },
    }).payload;

    expect(style.padding).toBe(4);
  });

  // why: THE PRICE, and this case has now been wrong TWICE in the same direction — worth saying out
  // loud, because both times the wrongness was a comment explaining why the remainder was permanent.
  //
  // It read 1 for the opacity tag with a note calling that partial BY DESIGN. What was actually left
  // was `focusable`, whose middle leg is an owned listener's EXISTENCE — one bit, not something
  // unportable (`touchable-focusable-payload.itest.ts`). Corrected to 0.
  //
  // It then read 1 for the HIGHLIGHT, with a note calling its underlay "built from live press state
  // and the genuine article the old comment was reaching for". Also half right: `shown` is live and
  // is still JS's, but the RULE was made of three portable inputs and one bit. Corrected to 0
  // (`touchable-highlight-underlay.itest.ts`).
  //
  // BOTH TAGS ARE AT ZERO. The next note that explains why some remainder cannot move should be read
  // with this case's history in hand.
  it('costs neither touchable tag a trip into JS', () => {
    const fade = opacity({ id: 'save' });
    print(`DEBUG touchable-opacity folds=${fade.folds}`);
    expect(fade.folds).toBe(0);

    const underlay = highlight({ id: 'save', onPress: () => {} });
    print(`DEBUG touchable-highlight folds=${underlay.folds}`);
    expect(underlay.folds).toBe(0);
  });
});

describe('what an input accessory view sends native', () => {
  // why: THE WHOLE POINT of this one. Its fold reassembled a bag it had just taken apart, so
  // deleting it changes no payload and removes a JSI round trip per node.
  it('costs no trip into JS at all', () => {
    // TWICE, and the first one is not the measurement. The harness carries exactly ONE surface
    // (`kSurfaceId = 1`, `symbiote-host.h`), so every node this file commits stays attached to it —
    // and a touchable above requested a commit from `onOwnedListenerChange` that had nowhere to land
    // yet. That deferred work rides into the NEXT commit and shows up as a fold this tag did not
    // pay. The first call absorbs it; the second is quiet and is the one read.
    const props = {
      nativeID: 'toolbar',
      backgroundColor: '#ff0000',
      style: { height: 44 },
    };
    accessory(props);
    const committed = accessory(props);
    print(`DEBUG input-accessory-view folds=${committed.folds}`);

    expect(committed.folds).toBe(0);
  });

  // why: and it still sends what it always sent. Both names are real native props of RN's
  // `InputAccessoryView`, and `nativeID` is the one a TextInput's `inputAccessoryViewID` docks to —
  // losing it detaches the toolbar with nothing to show for it.
  it('carries its two native props and its style through', () => {
    const payload = accessory({
      nativeID: 'toolbar',
      backgroundColor: '#ff0000',
      style: { height: 44 },
    }).payload;

    expect(payload.nativeID).toBe('toolbar');
    expect(payload.backgroundColor).toBe(0xff_ff_00_00);
    expect(payload.height).toBe(44);
  });

  // why: the deleted fold narrowed `backgroundColor` with `typeof === 'string'`, which DROPPED a
  // numeric colour — a shape `processColor` accepts and RN's own validAttributes declare. Removing
  // the fold removes the narrowing, and this is the case that proves it was never a rule.
  it('no longer drops a numeric backgroundColor', () => {
    expect(
      accessory({ backgroundColor: 0xff_00_00_ff }).payload.backgroundColor,
    ).toBe(0xff_00_00_ff);
  });

  // why: `InputAccessoryView.js`'s `styles.container = {position: 'absolute'}`, composed as
  // `[props.style, styles.container]` — the PLATFORM's half LAST, so it wins over whatever the app
  // wrote. Every InputAccessoryView ever rendered is positioned absolutely; nothing here is
  // per-instance, which is what makes it the tag's rule rather than composition.
  it('positions itself absolutely, unconditionally', () => {
    expect(accessory({}).payload.position).toBe('absolute');
  });

  // why: the ORDER is the whole point of the fixed-last placement above — an app cannot opt out of
  // the absolute positioning by authoring its own `position`, matching upstream's array order
  // exactly.
  it('overrides an authored position, matching the platform default winning last', () => {
    expect(
      accessory({ style: { position: 'relative' } }).payload.position,
    ).toBe('absolute');
  });
});

report();
