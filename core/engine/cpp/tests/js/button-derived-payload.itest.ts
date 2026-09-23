// Button's DERIVED nodes — the three it builds itself, and the two of their folds that had no
// business being folds.
//
// THE TREE, and it differs by platform (`Button.js:281-284`, and `buildStructure` follows it):
//
//   iOS       button -> view -> text -> rawtext        four nodes, four payload folds
//   Android   button ->         text -> rawtext        three; TNF clones onto the button itself
//
// `button-payload.itest.ts` says of these "they hang on DERIVED nodes — a raw text carries no tag at
// all, so there is nothing for a tag-keyed rule to key on". That was true of what the code DID and
// not of what it could do: a derived node is named by the behavior that builds it, which is exactly
// how `image-background-image` and the ActivityIndicator spinner got their tags. What a raw text
// genuinely cannot do is carry an app's props — it carries one key, `text`.
//
// AND ONE OF THE TWO WAS NOT A RULE AT ALL. `viewFold` wrote
// `style: resolveButtonViewStyle(color, disabled)` on the view. That function returns the CONSTANT
// `buttonViewStyle` on every platform but Android, and `buttonViewStyle` is `{}` on iOS — and the
// view node is built ONLY in the non-Android branch. So on the one platform where it ran it read
// two props off its owner, threw both away, and wrote an empty style, for one JSI round trip per
// button per commit. It is deleted rather than ported; this file is what proves the payload did not
// move when it went.
//
// The cases below are written against the COMMITTED payload of each node, because that is the only
// place a rule's absence and a rule's output can be told apart.

import { registerButtonBehavior } from '@symbiote-native/components';

import {
  childrenOf,
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerButtonBehavior();

type ISubtree = {
  readonly button: Readonly<Record<string, unknown>>;
  readonly view: Readonly<Record<string, unknown>>;
  readonly text: Readonly<Record<string, unknown>>;
  readonly label: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

// Walks the tree the behavior actually built rather than looking nodes up by testID: none of these
// three is reachable by an app, so position IS their identity. Every hop is asserted, so a change
// in the SHAPE fails here loudly instead of silently re-pointing an assertion at another node.
function commit(props: Record<string, unknown>): ISubtree {
  const surface = createSurface(ROOT_TAG);
  const button: ISymbioteNode = createElement('RCTView', false, 'button');
  // `routeProp`, NOT `setProp`, and it is load-bearing rather than stylistic: `title` is a prop the
  // app writes on the BUTTON that `slotProps` redirects onto the raw label, and that redirect lives
  // in `routeProp`. Written with `setProp` the label stays empty, the commit walk drops an empty raw
  // text from its parent's child set, and the node this file is about never commits at all.
  routeProp(button, 'title', 'Save');
  for (const [name, value] of Object.entries(props))
    routeProp(button, name, value);
  surface.appendChild(button);
  surface.commit();
  mounted();

  const buttonPayload = committedPayloadOf(button);
  if (buttonPayload === undefined)
    throw new Error('the button committed nothing');

  // `childHost` is the LABEL (buildStructure returns it), so the view and the text are reached by
  // walking down instead.
  const view = childrenOf(button)[0];
  if (view === undefined) throw new Error('the button built no view');
  const text = childrenOf(view)[0];
  if (text === undefined) throw new Error('the view holds no text');
  const label = childrenOf(text)[0];
  if (label === undefined) throw new Error('the text holds no raw label');

  const viewPayload = committedPayloadOf(view);
  const textPayload = committedPayloadOf(text);
  const labelPayload = committedPayloadOf(label);
  if (viewPayload === undefined) throw new Error('the VIEW committed nothing');
  if (textPayload === undefined) throw new Error('the TEXT committed nothing');
  if (labelPayload === undefined)
    throw new Error('the LABEL committed nothing');

  return {
    button: buttonPayload,
    view: viewPayload,
    text: textPayload,
    label: labelPayload,
    folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0,
  };
}

describe('what a button’s derived nodes send native', () => {
  // why: THE SHAPE, asserted before any payload, because every other case in this file addresses a
  // node by position. RN's iOS Button is a View wrapping a Text wrapping the title
  // (`Button.js:389-400`); if that stopped being true, the cases below would quietly start
  // describing different nodes.
  it('builds a view holding a text holding a raw label', () => {
    const tree = commit({});

    expect(tree.view.accessible).toBe(undefined);
    // The text node carries RN's own Text defaults, which is what identifies it as the label's
    // parent rather than some other view.
    expect(tree.text.allowFontScaling).toBe(true);
    expect(tree.label.text).toBe('Save');
  });

  // why: THE CASE THE DELETION RESTS ON. `buttonViewStyle` is `{}` off Android and the view exists
  // only off Android, so the fold's entire output was an empty style. If this node ever carried a
  // real style here, deleting the fold would have been a visual regression rather than a no-op.
  it('gives the wrapping view no style of its own', () => {
    const tree = commit({});

    expect(tree.view.backgroundColor).toBe(undefined);
    expect(tree.view.borderRadius).toBe(undefined);
    expect(tree.view.elevation).toBe(undefined);
  });

  // why: and it stays empty when the app asks for a colour, which is the half that makes the
  // deletion safe rather than merely true today. `color` is Android's button background
  // (`Button.js:353-357`); on iOS it tints the LABEL, and the view must not pick it up.
  it('keeps the view unstyled even when the app sets a color', () => {
    const tree = commit({ color: '#ff0000' });

    expect(tree.view.backgroundColor).toBe(undefined);
    // The colour is not lost — it lands where RN puts it on this platform. Asserted as PRESENT
    // rather than as the string the app wrote: RN's own colour processor has run by the time a
    // payload exists, so `'#ff0000'` is the integer 4294901760 here. What this case is about is
    // which NODE carries it, and pinning the encoding would make it a test of `processColor`.
    expect(typeof tree.text.color).toBe('number');
  });

  // why: the label's own rule, and the only thing it does — `Button.js:352-353` renders the title
  // uppercased on Android and verbatim everywhere else. Headless is not Android, so this pins the
  // identity branch; the uppercase branch is `#ifdef ANDROID` and is unreachable here for the same
  // reason `android_ripple` and `decelerationRate`'s constants are.
  it('passes the title through unchanged off Android', () => {
    expect(commit({}).label.text).toBe('Save');
  });

  // why: a raw text's payload is ONE key. A rule that wrote anything else onto it would be writing
  // into a Fabric component that declares nothing but `text`, and Fabric would drop it in silence.
  it('sends nothing but text on the raw label', () => {
    expect(Object.keys(commit({}).label)).toEqual(['text']);
  });

  // why: THE LABEL'S LOOK, which is the last thing about this primitive that was not the engine's.
  // `Button.js:389-400` styles its Text from the button's own props, and off Android that is the
  // iOS system blue at 18pt with an 8pt margin. An unstyled label is the visible failure.
  it('paints the label with the platform button style', () => {
    const text = commit({}).text;

    expect(text.fontSize).toBe(18);
    expect(text.margin).toBe(8);
    expect(text.textAlign).toBe('center');
  });

  // why: `color` tints the TEXT on iOS and the BUTTON on Android (`Button.js:318-324`). This is the
  // half that needs the BUTTON's props while this node's parent is the VIEW — the read that made
  // this the last fold standing.
  it('tints the label from the button’s color, two nodes up', () => {
    const plain = commit({}).text;
    const tinted = commit({ color: '#ff0000' }).text;

    // Asserted as CHANGED rather than as a literal: RN's colour processor has run by the time a
    // payload exists, so both are integers. What this case is about is that the value travelled.
    expect(typeof plain.color).toBe('number');
    expect(typeof tinted.color).toBe('number');
    expect(plain.color === tinted.color).toBe(false);
  });

  // why: RN tints with ANY ColorValue (`if (color)`, Button.js:321), so a PlatformColor reaches the
  // label as the opaque object native resolves — not silently replaced by the default blue.
  it('tints the label with a PlatformColor, not only a string', () => {
    const platformColor = { semantic: ['systemRed'] };
    const tinted = commit({ color: platformColor }).text;

    expect(tinted.color).toEqual(platformColor);
  });

  // why: `disabled` WINS over `color` on both platforms, because RN pushes the disabled text colour
  // after the tint (`Button.js:396-399`). A disabled button that still shows its brand tint reads as
  // enabled, which is the whole point of the greying.
  it('greys the label when disabled, over any tint', () => {
    const grey = commit({ disabled: true }).text;
    const greyWithTint = commit({ disabled: true, color: '#ff0000' }).text;

    expect(grey.color).toBe(greyWithTint.color);
  });

  // why: and it is BUTTON's three-way `disabled`, not the raw prop — `aria-disabled` alone greys the
  // label (`Button.js:331,337`), the same resolution its `focusable` uses. A rule reading one prop
  // would leave an aria-disabled button looking enabled while already refusing the press.
  it('greys the label from aria-disabled alone', () => {
    expect(commit({ 'aria-disabled': true }).text.color).toBe(
      commit({ disabled: true }).text.color,
    );
  });

  // why: RN puts `disabled` on the Text as well (`Button.js:386`) — a real RCTText prop that
  // Android's accessibility layer reads, and not the same thing as the greyed colour above.
  //
  // ABSENT rather than `false` when nothing disabled it, which is RN's own shape: the resolution
  // answers `undefined` when none of the three sources spoke, and React omits an undefined prop
  // rather than sending it. Writing `false` here would put a key on every button's label that RN
  // never sends.
  it('carries disabled onto the text node itself', () => {
    expect(commit({ disabled: true }).text.disabled).toBe(true);
    expect(commit({}).text.disabled).toBe(undefined);
  });

  // why: THE FAILURE MODE AN ANCESTOR-READING RULE INTRODUCES, and this primitive's version of it.
  // The rule runs when the LABEL TEXT is dirty, so a `color` written on the BUTTON after the first
  // commit has to mark that node dirty or the label keeps its first tint forever while the button
  // believes it changed. `markPropsDirty` bubbles UP, never down, so nothing does this by accident.
  //
  // `slotDerived` marks the slot and `addDerivedNode` extends the mark past it to the text — which
  // is why `buildStructure` calls it. The requirement did not change when the fold became a rule,
  // and it was not asserted against a committed payload until now.
  it('re-tints the label when the button’s color changes after mount', () => {
    const surface = createSurface(ROOT_TAG);
    const button: ISymbioteNode = createElement('RCTView', false, 'button');
    routeProp(button, 'title', 'Save');
    surface.appendChild(button);
    surface.commit();
    mounted();

    const text = childrenOf(childrenOf(button)[0])[0];
    const before = committedPayloadOf(text)?.color;

    routeProp(button, 'color', '#ff0000');
    surface.commit();
    mounted();

    const after = committedPayloadOf(text)?.color;
    expect(typeof before).toBe('number');
    expect(typeof after).toBe('number');
    expect(before === after).toBe(false);
  });

  // why: THE PRICE, and off Android it is now ZERO — the most expensive primitive in this codebase
  // costs nothing in JS. It read 5, then 3, then 1, then 0 in three days.
  //
  // The number it started from was wrong in a way the measurement had to correct: this file recorded
  // FOUR, one per node the behavior builds. Driven through `routeProp` a single mounted button
  // measured FIVE, because the fold counter is per SURFACE over the commits a button actually
  // performs and its touchable's `afterCommit` settle re-commits it. "One fold per node" was never
  // the model, which is also why removing the owner's single fold was worth two.
  //
  // The last one needed a seam that did not exist: the label's style is a function of the BUTTON's
  // `color` and `disabled` while its parent is the VIEW, so `ownerProps` could not reach it.
  // `IAncestorLookup` asks for the nearest ancestor carrying a tag instead — a CSS ancestor
  // selector, and the same rule is then correct on iOS (grandparent) and Android (parent).
  //
  // On Android ONE fold survives, the owner's, for the view style and the ripple background.
  it('costs no trip into JS at all', () => {
    const tree = commit({});
    print(`DEBUG button-derived folds=${tree.folds}`);
    expect(tree.folds).toBe(0);
  });
});

report();
