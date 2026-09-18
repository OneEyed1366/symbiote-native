// TouchableHighlight's UNDERLAY — the last per-node fold with a props-shaped rule, and the one this
// migration recorded three times as "the genuine unportable article".
//
// WHAT THAT NOTE GOT RIGHT AND WHAT IT CONFLATED. It is true that `shown` flips inside a gesture and
// that no props-only rule can see it. It is false that the RULE therefore has to be JS. Split the
// fold's four inputs and only one of them is the application's:
//
//   shown           live, flips mid-gesture, held past release by a `delayPressOut` timer — JS
//   hasPressHandler the EXISTENCE of any of four press listeners — already the platform's business,
//                   and already crossing, since `OP_SET_OWNED_LISTENER` landed for `focusable`
//   underlayColor   an ordinary prop — and one `foldPressableProps` already STRIPS
//   activeOpacity   the same
//
// So three of four were portable before this file existed, and the fourth is ONE BIT. That is the
// same shape `hasPressListener` had: a value JS merely HOLDS is a wiring question, and wiring is
// cheap — what is unreachable is a value only JS can COMPUTE.
//
// THE BROWSER SETTLES IT AND THE ENGINE HAD ALREADY AGREED. `setNodePressed`'s own header calls the
// press state "the engine-owned half of what `:active` is on the web", and a UA stylesheet is
// exactly where "what a control looks like while it is being pressed" belongs. The app supplies the
// colour through a property; the platform decides what to do with it. `shown` is not `pressed` —
// RN holds the underlay past release so a fast tap still flashes (`TouchableHighlight.js:270-293`) —
// which is why the bit is its own and not that one. The TIMER stays JS, where Pressability is.
//
// AND THE TWO PROPS WERE ALREADY HALF HERE, which is the tell that made this worth doing. The engine
// strips `underlayColor` and `activeOpacity` from the payload (`kTouchableFeedbackKeys`) because RN
// forwards neither to the View it renders — so the JS fold could not read them off the bag it was
// handed and had to go back to the NODE for them. One side erasing a prop while the other reaches
// around it for the same value is two halves of one rule, and this joins them.
//
// NOT PORTED, and stated so the boundary stays where it is: WHEN the underlay shows. The hold timer,
// the `press`-then-`pressOut` ordering, the re-arm on a second tap, the `onShowUnderlay` /
// `onHideUnderlay` callbacks. All of it runs at gesture rate and calls into app code, which is where
// a browser keeps it too. `core/components/src/behaviors/touchable-highlight.test.ts` still owns
// every one of those cases and none of them moved.

import { registerTouchableHighlightBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  setEventListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const TOUCHABLE = 'RCTView';
const TAG = 'touchable-highlight';
// RN's own two defaults, `TouchableHighlight.js:258-268`.
const DEFAULT_UNDERLAY = 'black';
const DEFAULT_CHILD_OPACITY = 0.85;

let nextRootTag = 8800;

registerTouchableHighlightBehavior();

const TOUCH: ISymbioteEvent = {
  nativeEvent: { pageX: 0, pageY: 0, locationX: 0, locationY: 0 },
};

type ITouchable = {
  readonly node: ISymbioteNode;
  readonly payload: () => Readonly<Record<string, unknown>>;
  // CAPTURED AT COMMIT, not read on demand, and the difference is a false green rather than a
  // nicety. `readSurfaceTelemetry` answers about the LAST commit, so a second read with no commit
  // between reports a fresh record — this was written as a lazy getter first and the cost assertion
  // passed at zero while `print` showed 1 on the very same line. An assertion that reads its subject
  // twice is not asserting about the same thing twice.
  readonly folds: () => number;
  readonly pressIn: () => Readonly<Record<string, unknown>>;
  readonly pressOut: () => Readonly<Record<string, unknown>>;
};

// A mounted `<touchable-highlight>`, driven through the listeners the behavior itself installed —
// the same way `behaviors/touchable-highlight.test.ts` drives one. There is no other honest way in:
// the underlay is a function of a real gesture, and faking the bit would test the fixture.
function touchable(
  props: Readonly<Record<string, unknown>> = {},
  { withPressHandler = true }: { withPressHandler?: boolean } = {},
): ITouchable {
  const rootTag = (nextRootTag += 1);
  const surface = createSurface(rootTag);
  const node: ISymbioteNode = createElement(TOUCHABLE, false, TAG);
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  if (withPressHandler) setEventListener(node, 'press', () => {});
  surface.appendChild(node);

  let foldsAtLastCommit = 0;
  const settle = (): Readonly<Record<string, unknown>> => {
    surface.commit();
    mounted();
    foldsAtLastCommit = readSurfaceTelemetry(rootTag)?.foldsFound ?? 0;
    const payload = committedPayloadOf(node);
    if (payload === undefined)
      throw new Error('the touchable committed nothing');
    return payload;
  };
  settle();

  const fire = (name: string): void => {
    const listener = node.listeners?.get(name);
    if (listener === undefined)
      throw new Error(`no "${name}" listener — the behavior did not attach`);
    listener(TOUCH);
  };

  return {
    node,
    payload: settle,
    folds: () => foldsAtLastCommit,
    pressIn: () => {
      fire('pressIn');
      fire('startShouldSetResponder');
      return settle();
    },
    pressOut: () => {
      fire('press');
      fire('pressOut');
      return settle();
    },
  };
}

describe('what a pressed touchable-highlight sends native', () => {
  // why: THE PRICE, and the reason this is a port rather than a tidy-up. Everything below would pass
  // with the rule still in a per-node JS closure — `touchable-focusable-payload.itest.ts` measured
  // `foldsFound` at FIVE for one mounted touchable, because the opacity settle re-commits it before
  // it comes to rest. A fold is charged per commit, not per node.
  it('costs no trip into JS, pressed or not', () => {
    const subject = touchable({ underlayColor: '#ff0000' });
    print(`DEBUG highlight folds at rest=${subject.folds()}`);
    expect(subject.folds()).toBe(0);

    subject.pressIn();
    print(`DEBUG highlight folds pressed=${subject.folds()}`);
    expect(subject.folds()).toBe(0);
  });

  // why: at rest there is no underlay at all. An absence assertion, and it is the control the two
  // below need — a rule that painted unconditionally would satisfy every "pressed looks right" case
  // in this file and leave every TouchableHighlight permanently tinted.
  it('paints nothing before a finger lands', () => {
    const payload = touchable({ underlayColor: '#ff0000' }).payload();

    expect(payload.backgroundColor).toBe(undefined);
    expect(payload.opacity).toBe(undefined);
  });

  // why: RN composes BOTH halves onto the one node here — the underlay's background and the child's
  // opacity — which is the single-node simplification every adapter already shipped
  // (`behaviors/touchable-highlight.ts`'s header). `#ff0000` is processed to an int by the payload
  // builder, which is the proof it travelled as a real colour prop rather than a passthrough string.
  it('paints the underlay and dims the child while pressed', () => {
    const payload = touchable({
      underlayColor: '#ff0000',
      activeOpacity: 0.25,
    }).pressIn();

    expect(payload.backgroundColor).toBe(0xff_ff_00_00);
    expect(payload.opacity).toBe(0.25);
  });

  // why: RN's own defaults, and they are the platform's rather than any app's — `'black'` and
  // `0.85` (`TouchableHighlight.js:258-268`). They lived in JS as the only copy until the port; a
  // rule that forgot them would paint nothing on the commonest spelling of all, `<TouchableHighlight
  // onPress={...}>` with no styling props at all.
  it('falls back to the underlay and opacity RN itself picks', () => {
    const payload = touchable().pressIn();

    expect(payload.backgroundColor).toBe(0xff_00_00_00);
    expect(payload.opacity).toBe(DEFAULT_CHILD_OPACITY);
    print(`DEBUG defaults are ${DEFAULT_UNDERLAY} / ${DEFAULT_CHILD_OPACITY}`);
  });

  // why: `_hasPressHandler` (`TouchableHighlight.js:296-302`) — a decorative highlight with no press
  // callback must not flash under a touch that merely passes through it. This is the leg that needed
  // `OP_SET_OWNED_LISTENER`: `press` never becomes a prop, because the behavior owns the name and
  // diverts it to its own stash, so a props-only rule is blind to it.
  it('never paints without a press handler', () => {
    const subject = touchable(
      { underlayColor: '#ff0000' },
      { withPressHandler: false },
    );
    const payload = subject.pressIn();

    expect(payload.backgroundColor).toBe(undefined);
    expect(payload.opacity).toBe(undefined);
  });

  // why: RN's gate is ANY of four (`_hasPressHandler`, `TouchableHighlight.js:296-302`), not
  // `onPress` alone — so a `<TouchableHighlight onPressIn={…}>` with no `onPress` must still flash.
  // This is the case that makes the host's press-listener state a MASK rather than the single bool
  // `focusable` needs: that question is `onPress` alone and this one is not, and one bit cannot be
  // both. Without it a bool named `hasPressListener` serves both readers and this control goes dark.
  it('paints for any of the four press names, not just onPress', () => {
    for (const name of ['pressIn', 'pressOut', 'longPress']) {
      const subject = touchable(
        { underlayColor: '#ff0000' },
        { withPressHandler: false },
      );
      setEventListener(subject.node, name, () => {});
      expect(subject.pressIn().backgroundColor).toBe(0xff_ff_00_00);
    }
  });

  // why: the mask can go DOWN, and that is the half a single bool cannot express — clearing ONE name
  // must not clear the answer while another is still wired. An OR-ed bool would stay true forever
  // after the first handler ever seen, so a control whose only remaining handler was removed would
  // go on flashing. The reverse case (clearing the LAST one stops the paint) is what proves the bit
  // is being cleared at all rather than merely never set.
  it('tracks a press name being taken away', () => {
    const subject = touchable({ underlayColor: '#ff0000' });
    setEventListener(subject.node, 'pressIn', () => {});
    expect(subject.pressIn().backgroundColor).toBe(0xff_ff_00_00);

    // One of two gone: still reacts.
    setEventListener(subject.node, 'press', undefined);
    expect(subject.pressIn().backgroundColor).toBe(0xff_ff_00_00);

    // The last one gone: stops.
    setEventListener(subject.node, 'pressIn', undefined);
    expect(subject.pressIn().backgroundColor).toBe(undefined);
  });

  // why: the app's own style must survive underneath, and the underlay must beat it — RN appends the
  // extra styles after the author's (`TouchableHighlight.js:189`). Reversed, a highlight with any
  // `backgroundColor` of its own would never visibly respond to a touch.
  it('composes over the authored style rather than replacing it', () => {
    const subject = touchable({
      style: { backgroundColor: '#0000ff', paddingLeft: 3 },
      underlayColor: '#ff0000',
    });

    expect(subject.payload().backgroundColor).toBe(0xff_00_00_ff);
    const pressed = subject.pressIn();
    expect(pressed.backgroundColor).toBe(0xff_ff_00_00);
    // Untouched by the underlay, which only ever adds two keys.
    expect(pressed.paddingLeft).toBe(3);
  });

  // why: the rule reads the AUTHORED bag on every commit rather than capturing at mount, so a colour
  // changed after the fact takes effect on the next press. Travelled here from
  // `adapters/vue/src/components/touchable.test.ts`, which could no longer see the colour at all —
  // and it is the case a bit-shaped witness cannot replace, which is why it moved rather than being
  // rewritten there.
  it('honours an underlayColor changed after mount', () => {
    const subject = touchable({ underlayColor: '#ff0000' });
    expect(subject.pressIn().backgroundColor).toBe(0xff_ff_00_00);

    routeProp(subject.node, 'underlayColor', '#00ff00');
    expect(subject.payload().backgroundColor).toBe(0xff_00_ff_00);
  });

  // why: neither name may reach Fabric raw. No ViewConfig declares either, so a leak is silent — and
  // `activeOpacity` leaking would be worse than silent, since `opacity` IS a real view prop and a
  // stray `activeOpacity` sitting beside it reads like a working feature in a payload dump.
  it('sends neither feedback prop to native', () => {
    const payload = touchable({
      underlayColor: '#ff0000',
      activeOpacity: 0.25,
    }).pressIn();

    expect(payload.underlayColor).toBe(undefined);
    expect(payload.activeOpacity).toBe(undefined);
  });

  // why: the bit goes BACK. The hold timer is JS's and runs past release, so this drives `press` then
  // `pressOut` and then lets the scheduler run — what matters here is that the payload returns to its
  // unpainted shape at all, not when. A rule that only ever set the style would leave every tapped
  // control tinted for the life of the screen.
  it('clears the underlay again after the gesture', async () => {
    const subject = touchable({ underlayColor: '#ff0000' });
    expect(subject.pressIn().backgroundColor).toBe(0xff_ff_00_00);

    subject.pressOut();
    await new Promise(resolve => setTimeout(resolve, 250));
    const payload = subject.payload();

    expect(payload.backgroundColor).toBe(undefined);
    expect(payload.opacity).toBe(undefined);
  });
});

report();
