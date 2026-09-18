// `focusable` on the touchables — the last JS fold three tags carried, and the first rule whose
// missing input was not a PROP at all.
//
// THE RULE IS RN'S, verbatim (`TouchableOpacity.js:336-339`, and `TouchableHighlight.js` the same):
//
//     focusable={this.props.focusable !== false && this.props.onPress !== undefined
//                && !this.props.disabled}
//
// Two of those three legs are ordinary props and crossed years ago. The middle one is the EXISTENCE
// of an app callback, and `onPress` on one of our tags never becomes a prop: `setEventListener`
// diverts a name the behavior OWNS into a JS stash, because `node.listeners` is single-slot and the
// behavior's own dispatcher holds it. So the bag the payload builder sees has no trace of it, which
// is why this one key kept three folds alive after every other rule had moved.
//
// WHY THE EXISTENCE MAY CROSS WHEN THE FUNCTION MAY NOT, and the browser settles it rather than
// taste: a UA computes focusability itself, and it can, because `addEventListener` is the UA's own
// API — the browser KNOWS which of its elements have a click handler. The handler's BODY is the
// application's and never leaves it. That is exactly the split here: one boolean per listener flip
// crosses as `OP_SET_OWNED_LISTENER`, the closure stays in the stash, and `foldPressableProps`
// resolves the key off the node like every other platform rule.
//
// A FLIP IS A MOUNT-TIME EVENT, not a per-render one, which is what makes the op affordable. The
// engine deliberately does not notify on listener IDENTITY — a framework hands a fresh closure
// nearly every render — so this crosses when a handler appears or disappears and at no other time.
// Against the fold it replaces, which was charged on every commit the node was dirty in.

import {
  registerTouchableOpacityBehavior,
  registerTouchableHighlightBehavior,
} from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerTouchableOpacityBehavior();
registerTouchableHighlightBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

// `routeProp`, because `onPress` reaches the stash only through the engine's own event routing —
// a fixture that called `setProp` would put a FUNCTION in the props bag, which is a shape no
// adapter produces and which the payload builder drops on the floor.
function commit(
  tag: string,
  props: Record<string, unknown>,
  onPress?: () => void,
): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTView', false, tag);
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  if (onPress !== undefined) routeProp(node, 'onPress', onPress);

  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('the touchable committed nothing');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

const noop = (): void => {};

describe('what a touchable sends native for focusable', () => {
  // why: the ordinary case, and the one every app produces. A touchable with a press handler is a
  // focus stop — on a TV remote, on a keyboard, and for an accessibility service walking the tree.
  it('is focusable when a press handler is wired', () => {
    expect(commit('touchable-opacity', {}, noop).payload.focusable).toBe(true);
  });

  // why: THE LEG THAT NEEDED THE WIRE. Nothing in the props bag distinguishes this from the case
  // above — the only difference is a callback that never becomes a prop. A rule that guessed from
  // props alone would make every decorative touchable a focus stop, which is the TV-remote bug
  // this expression exists to prevent.
  it('is NOT focusable when nothing is wired to press', () => {
    expect(commit('touchable-opacity', {}).payload.focusable).toBe(false);
  });

  // why: an app that says `focusable={false}` is opting a control out of the focus order
  // deliberately — a decorative wrapper that still needs a press. The explicit answer wins.
  it('honours an explicit focusable false even with a handler', () => {
    expect(
      commit('touchable-opacity', { focusable: false }, noop).payload.focusable,
    ).toBe(false);
  });

  // why: a disabled control is not a focus stop. RN spells this `!this.props.disabled` on the same
  // expression, so a disabled touchable drops out of the focus order while still rendering.
  it('is NOT focusable when disabled, handler or not', () => {
    expect(
      commit('touchable-opacity', { disabled: true }, noop).payload.focusable,
    ).toBe(false);
  });

  // why: `disabled` is STRIPPED from the bag by the pressable rule that runs ahead of this one, so
  // a reading taken off the bag would resolve every disabled touchable as focusable. That was a
  // real correction once (the JS fold had to read `propOf(node, 'disabled')` for it), and the rule
  // moving into the engine must not reintroduce it — this case is what would catch that.
  it('reads disabled even though the pressable rule strips it from the payload', () => {
    const committed = commit('touchable-opacity', { disabled: true }, noop);
    expect(committed.payload.disabled).toBe(undefined);
    expect(committed.payload.focusable).toBe(false);
  });

  // why: TouchableHighlight carries the identical expression upstream and reached it through its
  // own copy of the fold. One rule, two tags — the same shape `usesPressableRule` already has.
  it('resolves the same way for a touchable-highlight', () => {
    expect(commit('touchable-highlight', {}, noop).payload.focusable).toBe(
      true,
    );
    expect(commit('touchable-highlight', {}).payload.focusable).toBe(false);
  });

  // why: A BUG THIS PORT FOUND, and it is the same Trap A the touchables were corrected for once
  // already — `touchable-opacity`'s copy of this expression was moved onto the node and
  // `touchable-highlight`'s was not. Its fold read `props.disabled` from the bag the pressable rule
  // had already stripped, so the leg silently evaluated to "not disabled" and every DISABLED
  // highlight stayed in the focus order: reachable from a TV remote and from a keyboard, announced
  // as a focus stop, and doing nothing when activated.
  //
  // One rule for both tags is what closes it, which is the argument for the port beyond its price:
  // two copies of one expression drift, and this one already had.
  it('is NOT focusable when a touchable-highlight is disabled', () => {
    expect(
      commit('touchable-highlight', { disabled: true }, noop).payload.focusable,
    ).toBe(false);
  });

  // why: A LISTENER THAT ARRIVES LATE, which is not exotic — a row that becomes pressable once its
  // data loads is an ordinary screen. The flip has to reach the payload, or the control renders
  // permanently unfocusable while visibly interactive.
  it('becomes focusable when the handler is wired after the first commit', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement(
      'RCTView',
      false,
      'touchable-opacity',
    );
    surface.appendChild(node);
    surface.commit();
    mounted();
    expect(committedPayloadOf(node)?.focusable).toBe(false);

    routeProp(node, 'onPress', noop);
    surface.commit();
    mounted();

    expect(committedPayloadOf(node)?.focusable).toBe(true);
  });

  // why: and the reverse, which is the half a one-way installer forgets. Clearing the handler must
  // take the control back out of the focus order rather than leaving `focusable: true` standing.
  it('stops being focusable when the handler is cleared', () => {
    const surface = createSurface(ROOT_TAG);
    const node: ISymbioteNode = createElement(
      'RCTView',
      false,
      'touchable-opacity',
    );
    routeProp(node, 'onPress', noop);
    surface.appendChild(node);
    surface.commit();
    mounted();
    expect(committedPayloadOf(node)?.focusable).toBe(true);

    routeProp(node, 'onPress', undefined);
    surface.commit();
    mounted();

    expect(committedPayloadOf(node)?.focusable).toBe(false);
  });

  // why: THE PRICE, and the reason the wire is worth adding at all. These tags carried a fold for
  // this ONE key, on every commit they were dirty in, at ~17 us per node per commit. The listener
  // flip that replaces it is charged once, when a handler appears or disappears.
  it('costs no trip into JS', () => {
    const one = commit('touchable-opacity', {}, noop);
    print(`DEBUG touchable-focusable folds=${one.folds}`);
    expect(one.folds).toBe(0);
  });
});

report();
