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

import {
  registerPressableBehavior,
  registerTouchableHighlightBehavior,
} from '@symbiote-native/components';

import {
  appendChild,
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

type IPayload = Readonly<Record<string, unknown>>;

let nextRootTag = 8800;

registerTouchableHighlightBehavior();
registerPressableBehavior();

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

  // why: both halves land in one gesture, each on ITS OWN node — the underlay's background on the
  // container, the opacity on the single child, exactly as `_createExtraStyles` splits them
  // (`TouchableHighlight.js:258-266`) and the render applies them (`:358-361`, `:379-383`).
  // `#ff0000` is processed to an int by the payload builder, which is the proof it travelled as a
  // real colour prop rather than a passthrough string.
  //
  // THIS CASE ASSERTED THE ONE-NODE SHAPE until the split landed, and it was GREEN doing it: it read
  // `payload.opacity` off the owner and called that "dims the child". Nothing was wrong with the
  // case — its subject was the simplification every adapter shipped, and when that stopped being the
  // behavior the case had to say the new thing rather than be deleted for having described the old.
  it('paints the underlay and dims the child while pressed', () => {
    const { owner, child } = touchableWithChild({
      underlayColor: '#ff0000',
      activeOpacity: 0.25,
    }).pressIn();

    expect(owner.backgroundColor).toBe(0xff_ff_00_00);
    // The half that was the defect: opacity here would fade the colour on the line above.
    expect(owner.opacity).toBe(undefined);
    expect(child.opacity).toBe(0.25);
  });

  // why: RN's own defaults, and they are the platform's rather than any app's — `'black'` and
  // `0.85` (`TouchableHighlight.js:258-268`). They lived in JS as the only copy until the port; a
  // rule that forgot them would paint nothing on the commonest spelling of all, `<TouchableHighlight
  // onPress={...}>` with no styling props at all.
  it('falls back to the underlay and opacity RN itself picks', () => {
    const { owner, child } = touchableWithChild().pressIn();

    expect(owner.backgroundColor).toBe(0xff_00_00_00);
    // On the CHILD since the split — the default is unchanged, only the node it lands on.
    expect(child.opacity).toBe(DEFAULT_CHILD_OPACITY);
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

  // why: `testOnly_pressed` is RN's documented way to snapshot a pressed control
  // (`TouchableHighlight.js:61, 189`), and we supported it NOWHERE until 2026-09-18 — a real
  // `<adapters_reach_full_feature_parity>` gap, found while reading the vendor for the underlay port
  // and deliberately left to its own commit so the port stayed a pure move.
  //
  // It is a PROP, so the rule reads it like any other and the gap closes for every adapter at once.
  it('paints from testOnly_pressed with no gesture at all', () => {
    const { owner, child } = touchableWithChild({
      underlayColor: '#ff0000',
      activeOpacity: 0.25,
      testOnly_pressed: true,
    }).settle();

    expect(owner.backgroundColor).toBe(0xff_ff_00_00);
    // BOTH nodes latch, which is the half a childless fixture could not have shown: the child's rule
    // reads the same prop off its OWNER, so a snapshot that only pinned the container would leave
    // the very thing the affordance exists to photograph — the dimmed content — undimmed.
    expect(child.opacity).toBe(0.25);
  });

  // why: RN'S TWO DEFAULTS ARE NOT SYMMETRIC, and reading the vendor is the only way to find out.
  // The opacity is `activeOpacity ?? 0.85` (`TouchableHighlight.js:260`) — `??`, so null counts as
  // absent. The colour is `underlayColor === undefined ? 'black' : underlayColor` (`:261-265`) — a
  // STRICT undefined check, so an explicit null travels through and paints nothing.
  //
  // That asymmetry is the whole feature: `underlayColor={null}` is how an app says "this control
  // responds, but not with a tint". Collapsing null onto the default takes that away and paints
  // black on exactly the control that asked for no colour — the loudest possible wrong answer.
  it('lets an underlayColor of null suppress the tint', () => {
    const { owner, child } = touchableWithChild({
      underlayColor: null,
      activeOpacity: 0.25,
    }).pressIn();

    // ABSENT rather than an explicit null, and that is the engine's normalisation rather than a
    // weaker assertion: RN puts `{backgroundColor: null}` in the style, Fabric reads a null colour
    // as the default, and the payload builder drops the key instead of carrying it. Same
    // instruction, one fewer key on the wire.
    expect(owner.backgroundColor).toBe(undefined);
    // The other half still runs: null suppresses the COLOUR, not the feedback.
    expect(child.opacity).toBe(0.25);
  });

  // why: the control for the case above, and it is the one that keeps the fix honest. `??` on the
  // opacity means null there is NOT the same instruction — it falls back like an absent value does,
  // so a symmetrical "null means nothing" reading would be wrong on this half.
  it('treats a null activeOpacity as absent, unlike the colour', () => {
    const { owner, child } = touchableWithChild({
      underlayColor: '#ff0000',
      activeOpacity: null,
    }).pressIn();

    expect(owner.backgroundColor).toBe(0xff_ff_00_00);
    expect(child.opacity).toBe(DEFAULT_CHILD_OPACITY);
  });

  // why: THE ASYMMETRY IS UPSTREAM'S AND IT IS EASY TO MISS. `_showUnderlay` gates on
  // `_hasPressHandler` (`:271`), but the INITIAL state does not — `state.extraStyles` is
  // `testOnly_pressed === true ? this._createExtraStyles() : null` (`:187-190`), with no such check.
  // So a decorative TouchableHighlight with no callbacks still snapshots pressed, which is what a
  // snapshot test of a disabled-looking control needs. Reproducing the gate here would look more
  // consistent and be wrong.
  it('paints from testOnly_pressed even with no press handler', () => {
    const payload = touchable(
      { underlayColor: '#ff0000', testOnly_pressed: true },
      { withPressHandler: false },
    ).payload();

    expect(payload.backgroundColor).toBe(0xff_ff_00_00);
  });

  // why: `_hideUnderlay` returns early on `testOnly_pressed` (`:284-286`), so the underlay LATCHES —
  // a full gesture must not clear it. Without this the snapshot is stable only until something
  // touches the control, which is precisely when a test would look.
  it('latches the underlay on across a whole gesture', async () => {
    const subject = touchable({
      underlayColor: '#ff0000',
      testOnly_pressed: true,
    });
    expect(subject.pressIn().backgroundColor).toBe(0xff_ff_00_00);

    subject.pressOut();
    await new Promise(resolve => setTimeout(resolve, 250));

    expect(subject.payload().backgroundColor).toBe(0xff_ff_00_00);
  });

  // why: no ViewConfig declares it — it is a JS-side testing affordance, not a native prop — so it
  // must be stripped like the two feedback props beside it.
  it('sends testOnly_pressed nowhere near native', () => {
    const payload = touchable({ testOnly_pressed: true }).payload();

    expect(payload.testOnly_pressed).toBe(undefined);
  });

  // why: PRESSABLE'S HALF OF THE SAME PROP, and it is a different mechanism rather than the same one
  // on another tag. TouchableHighlight PAINTS from it, so a C++ rule serves it; Pressable SEEDS its
  // pressed state (`Pressable.js:222`, `usePressState(testOnly_pressed === true)`), which selects
  // `activeStyle` and any `:active` class — resolution that lives in JS because a class name resolves
  // against a JS registry. So the behavior seeds it and `setNodePressed` does the rest.
  //
  // SEEDED, not tracked, exactly as upstream: `usePressState`'s argument is an initial value, so a
  // later change of the prop does not re-seed there either. Matching that is the point.
  it('seeds a pressable pressed state from testOnly_pressed', () => {
    const rootTag = (nextRootTag += 1);
    const surface = createSurface(rootTag);
    const node: ISymbioteNode = createElement('RCTView', false, 'pressable');
    routeProp(node, 'style', { opacity: 1 });
    routeProp(node, 'activeStyle', { opacity: 0.4 });
    routeProp(node, 'testOnly_pressed', true);
    surface.appendChild(node);
    surface.commit();
    mounted();
    // The seed lands in `attachAfterCommit`, so the pressed style is committed on the NEXT pass —
    // one commit later than a paint rule would be, which is the honest cost of reading a prop from a
    // hook that runs after props exist. A test flushes; a human never sees the first frame.
    surface.commit();
    mounted();

    expect(committedPayloadOf(node)?.opacity).toBe(0.4);
    expect(committedPayloadOf(node)?.testOnly_pressed).toBe(undefined);
  });

  // why: the control for the case above. Without it, a rule that simply always took `activeStyle`
  // would pass — and every pressable on every screen would render permanently pressed.
  it('leaves a pressable unpressed without the prop', () => {
    const rootTag = (nextRootTag += 1);
    const surface = createSurface(rootTag);
    const node: ISymbioteNode = createElement('RCTView', false, 'pressable');
    routeProp(node, 'style', { opacity: 1 });
    routeProp(node, 'activeStyle', { opacity: 0.4 });
    surface.appendChild(node);
    surface.commit();
    mounted();
    surface.commit();
    mounted();

    expect(committedPayloadOf(node)?.opacity).toBe(1);
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

// A mounted `<touchable-highlight>` WITH the one child RN clones onto, driven the same way — the
// underlay is a function of a real gesture and faking the bit would test the fixture. The only
// addition is the node the opacity is supposed to land on, and reading ITS payload separately.
function touchableWithChild(props: Readonly<Record<string, unknown>> = {}): {
  readonly childNode: ISymbioteNode;
  readonly settle: () => { owner: IPayload; child: IPayload };
  readonly pressIn: () => { owner: IPayload; child: IPayload };
} {
  const rootTag = (nextRootTag += 1);
  const surface = createSurface(rootTag);
  const owner: ISymbioteNode = createElement(TOUCHABLE, false, TAG);
  for (const [name, value] of Object.entries(props))
    routeProp(owner, name, value);
  setEventListener(owner, 'press', () => {});
  // NO TAG on the child, which is the point rather than a shortcut: an app writes a plain `<view>`
  // in there, so whatever reaches it has to come from its OWNER, not from a rule of its own.
  const child: ISymbioteNode = createElement('RCTView', false);
  appendChild(owner, child);
  surface.appendChild(owner);

  const settle = (): { owner: IPayload; child: IPayload } => {
    surface.commit();
    mounted();
    const ownerPayload = committedPayloadOf(owner);
    const childPayload = committedPayloadOf(child);
    if (ownerPayload === undefined || childPayload === undefined)
      throw new Error('the pair committed nothing');
    return { owner: ownerPayload, child: childPayload };
  };
  settle();

  const fire = (name: string): void => {
    const listener = owner.listeners?.get(name);
    if (listener === undefined)
      throw new Error(`no "${name}" listener — the behavior did not attach`);
    listener(TOUCH);
  };

  return {
    childNode: child,
    settle,
    pressIn: () => {
      fire('pressIn');
      fire('startShouldSetResponder');
      return settle();
    },
  };
}

// RED ON PURPOSE as of this commit — the rule composes both halves onto the OWNER, so every case
// below fails until the split lands. They are the contract, written first.
//
// WHY THE SPLIT IS THE CORRECT SHAPE AND THE SINGLE NODE IS A BUG, not a taste difference: `opacity`
// on the same node as the underlay's `backgroundColor` fades the underlay ITSELF, so
// `underlayColor: 'black'` paints grey. Read against the vendor, RN keeps them on two nodes and
// never on one — `_createExtraStyles` (`TouchableHighlight.js:258-266`) builds the pair, and the
// render applies each to its own box:
//
//   :358-361   style={compose(props.style, extraStyles?.underlay)}    the container — background
//   :379-383   cloneElement(child, {style: compose(child.props.style, extraStyles?.child)})
//
// `React.Children.only` (`:306`) is why "the first child" is the whole population and a list would
// be the wrong seam. Both compose OVER the authored style, so a child that spells its own `opacity`
// loses to the feedback one — that ordering is upstream's and this file pins it.
//
// THE SEAM IS THE DESCENDANT RULE, and naming it right matters because the obvious answer is wrong.
// `IFirstChild` reads DOWN and cannot help: a rule returns the payload of the node it runs on, so it
// cannot write onto a child — the child's payload comes from the child's own `fabricProps` call. The
// child reads UP instead, off `IOwner.tagName`, exactly as the clone-onto-child port does. What is
// missing is one field: `underlayShown` lives in `ISelf`, the node's OWN state, and `IOwner` carries
// only `{props, tagName, hasPressListener}` — so a child cannot learn its owner's underlay is up.
// `IOwner`'s own header already prescribes this for the neighbouring bit: "`hasPressListener` is the
// parent's bit, not the node's ... read one hop up instead of on self."
describe('where the two halves of the underlay land', () => {
  // why: the control, and it has to come first — a rule that painted the child unconditionally would
  // satisfy both cases below and tint every view inside every TouchableHighlight on the screen.
  it('leaves both nodes alone before a finger lands', () => {
    const { owner, child } = touchableWithChild({
      underlayColor: '#ff0000',
      activeOpacity: 0.25,
    }).settle();

    expect(owner.backgroundColor).toBe(undefined);
    expect(owner.opacity).toBe(undefined);
    expect(child.opacity).toBe(undefined);
  });

  // The positive both halves share lives in `paints the underlay and dims the child while pressed`
  // above — the case that used to assert the one-node shape. Repeating it here would be a second
  // copy of one claim, not a second claim.

  // why: RN's default reaches the child too, and it is the platform's rather than any app's
  // (`TouchableHighlight.js:258-268`). A rule that only honoured an authored value would leave the
  // commonest spelling of all — `<TouchableHighlight>` with no props — undimmed.
  it('falls back to the platform child opacity', () => {
    const { child } = touchableWithChild({
      underlayColor: '#ff0000',
    }).pressIn();

    expect(child.opacity).toBe(DEFAULT_CHILD_OPACITY);
  });

  // why: the COMPOSE ORDER, read off the vendor rather than guessed — `:379-383` puts the feedback
  // opacity after the child's own, so a child that spells `opacity: 1` still dims. Without this the
  // obvious implementation (compose under, so the app "wins") passes every case above and leaves any
  // child with an explicit opacity visibly unresponsive.
  it('beats an opacity the child wrote itself', () => {
    const subject = touchableWithChild({
      underlayColor: '#ff0000',
      activeOpacity: 0.25,
    });
    routeProp(subject.childNode, 'style', { opacity: 1 });

    expect(subject.pressIn().child.opacity).toBe(0.25);
  });
});

// THE ASYMMETRIC DEFAULTS ARE ASSERTED NOW — `lets an underlayColor of null suppress the tint` and
// its control above. This note used to record them as a known divergence found while reading the
// vendor for the split and deliberately deferred, so that one red run answered one question. It did,
// the split landed, and the divergence closed in the commit after it.

report();
