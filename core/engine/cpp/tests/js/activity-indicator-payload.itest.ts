// ActivityIndicator's two nodes, both rules in the engine — and this is the first port to reach a
// DERIVED node, which needed a seam that did not exist an hour ago.
//
// THE SEAM. A tag reaches the host through `recordSetTag`, which `attachHostBehavior` emits and
// nothing else does — so it fires only for a tag JS has a BEHAVIOR for. The spinner is built by its
// owner's `buildStructure` and no app ever names it, so it had a tag, had platform semantics, and
// carried an empty `tagName` in the host. Registering a stub behavior for
// `activity-indicator-spinner` is what hands the tag over, and it is honest rather than a trick: a
// registration is this codebase's way of saying "this tag has platform semantics", which is exactly
// what is being claimed. The alternative — emitting the tag from `createElement` for every node —
// was rejected where `attachHostBehavior` explains itself: an app's own `<div>`-equivalent would pay
// an intern and an op to tell the host a name it has no rule for.
//
// WHAT THE TWO RULES ARE (`ActivityIndicator.js:99-118`):
//
//   activity-indicator          the centering View. `StyleSheet.compose(styles.container, style)` —
//                               base FIRST, so an app's own style still wins.
//   activity-indicator-spinner  the native spinner. The size translation, RN's two `!== false`
//                               defaults, and the platform's default colour.
//
// THE PLATFORM SPLIT IS BY COMPONENT NAME, not `#ifdef`, the same choice the Switch rule made:
// `ActivityIndicatorView` and `AndroidProgressBar` are two native components with two prop surfaces,
// and the name is already in the host — so both halves stay reachable from one test build.
//
// SIZE IS THE SUBTLE ONE. A NUMBER never reaches native: it sizes the spinner through style alone
// and the native enum takes 'small'/'large' only, so the key has to LEAVE rather than merely go
// unwritten. And Android's default colour is the THEME, expressed by OMITTING the key — Fabric's
// colour parser rejects a null, so sending one is not the same as sending nothing.

import { registerActivityIndicatorBehavior } from '@symbiote-native/components';

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

registerActivityIndicatorBehavior();

const IOS_SPINNER = 'ActivityIndicatorView';
const ANDROID_SPINNER = 'AndroidProgressBar';

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

// The HOST is built directly rather than through the owner's `buildStructure`, so each case commits
// exactly one node and the payload read is unambiguous about which one it came from.
const host = (props: Record<string, unknown>): ICommitted =>
  commit('RCTView', 'activity-indicator', props);
const spinner = (
  component: string,
  props: Record<string, unknown>,
): ICommitted => commit(component, 'activity-indicator-spinner', props);

describe('what the centering host sends native', () => {
  // why: `StyleSheet.compose(styles.container, style)` (`:114`) — the container centres the spinner
  // inside the space it was given. Without it the spinner sits top-left of its box, which is a
  // layout bug no prop assertion would catch.
  it('composes the centering style under the app style', () => {
    const payload = host({ style: { margin: 4 } }).payload;

    expect(payload.alignItems).toBe('center');
    expect(payload.justifyContent).toBe('center');
    expect(payload.margin).toBe(4);
  });

  // why: BASE FIRST is the whole content of `compose` here, and it is what lets an app override the
  // centering. Reversed, the container would win and the override would silently do nothing.
  it('lets the app style win over the base', () => {
    expect(
      host({ style: { alignItems: 'flex-start' } }).payload.alignItems,
    ).toBe('flex-start');
  });

  // why: the rule is unconditional — a host with no style at all still centres.
  it('centres with no app style at all', () => {
    expect(host({}).payload.alignItems).toBe('center');
  });
});

describe('what the native spinner sends', () => {
  // why: RN maps the two named sizes to a native enum AND a fixed pixel box (styles.sizeSmall /
  // sizeLarge). Both halves are needed: the enum picks the native spinner, the box reserves space.
  it('translates the named sizes to an enum and a box', () => {
    const small = spinner(IOS_SPINNER, { size: 'small' }).payload;
    expect(small.size).toBe('small');
    expect(small.width).toBe(20);
    expect(small.height).toBe(20);

    const large = spinner(IOS_SPINNER, { size: 'large' }).payload;
    expect(large.size).toBe('large');
    expect(large.width).toBe(36);
    expect(large.height).toBe(36);
  });

  // why: a NUMBER sizes the spinner through style ALONE — the native enum takes 'small'/'large' and
  // nothing else, so a numeric `size` reaching it is a value it cannot read. The key must LEAVE.
  it('sizes by style alone for a numeric size, and drops the key', () => {
    const payload = spinner(IOS_SPINNER, { size: 44 }).payload;

    expect(payload.width).toBe(44);
    expect(payload.height).toBe(44);
    expect(payload.size).toBe(undefined);
  });

  // why: RN's own default when the app writes no size (`:72`).
  it('defaults to small', () => {
    const payload = spinner(IOS_SPINNER, {}).payload;
    expect(payload.size).toBe('small');
    expect(payload.width).toBe(20);
  });

  // why: RN defaults both to true and spells it `!== false`, so only a literal false turns them off.
  // A tag has no destructuring default, which is why the rule has to carry it.
  it('defaults animating and hidesWhenStopped to true', () => {
    const on = spinner(IOS_SPINNER, {}).payload;
    expect(on.animating).toBe(true);
    expect(on.hidesWhenStopped).toBe(true);

    const off = spinner(IOS_SPINNER, {
      animating: false,
      hidesWhenStopped: false,
    }).payload;
    expect(off.animating).toBe(false);
    expect(off.hidesWhenStopped).toBe(false);
  });

  // why: iOS's default is RN's GRAY (`ActivityIndicator.js:25`). A spinner with no colour at all
  // paints in whatever the native view defaults to, which is not RN's answer.
  it('defaults the colour to GRAY on iOS', () => {
    expect(spinner(IOS_SPINNER, {}).payload.color).toBe(0xff_99_99_99);
  });

  // why: Android's default is the THEME, expressed by OMITTING the key. Fabric's colour parser
  // rejects a null, so sending one is not the same as sending nothing — this is the case where the
  // difference between "absent" and "null" is a crash rather than a shade.
  it('omits the colour entirely on Android', () => {
    expect(spinner(ANDROID_SPINNER, {}).payload.color).toBe(undefined);
  });

  // why: an explicit colour wins on both platforms — the default is a fallback, not an override.
  it('lets an explicit colour through on either platform', () => {
    expect(spinner(IOS_SPINNER, { color: '#ff0000' }).payload.color).toBe(
      0xff_ff_00_00,
    );
    expect(spinner(ANDROID_SPINNER, { color: '#ff0000' }).payload.color).toBe(
      0xff_ff_00_00,
    );
  });

  // why: THE PRICE. Both nodes shed their fold entirely — nothing either rule does reads the node,
  // an owner or live state, so unlike the touchables there is no JS half left to keep a trip for.
  it('costs no trip into JS for either node', () => {
    const one = host({});
    const two = spinner(IOS_SPINNER, {});
    print(`DEBUG activity-indicator host=${one.folds} spinner=${two.folds}`);

    expect(one.folds).toBe(0);
    expect(two.folds).toBe(0);
  });
});

report();
