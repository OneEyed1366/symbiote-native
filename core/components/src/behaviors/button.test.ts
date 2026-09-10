// Button as a tag. The default (iOS) half: the subtree the behavior builds, the folds the wrapper
// used to run, and the press machine it composes. The two-node re-fold is only OBSERVABLE on
// Android — `resolveButtonViewStyle` returns the same constant for every input off it — so it lives
// in `button-android.test.ts`, beside its own Platform mock.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { registerButtonBehavior, BUTTON_TAG } from './button';
import { foldHostBag } from '../fold-host-bag';

const fabric = installFabric();
let nextRootTag = 7300;

// The composed TouchableOpacity fade drives its frame loop off requestAnimationFrame, which Node
// does not have. The ~16ms setTimeout shim `touchable-opacity.test.ts` installs, verbatim.
const frameTimers = new Map<number, ReturnType<typeof setTimeout>>();
let nextFrameId = 1;
Object.assign(globalThis, {
  requestAnimationFrame(callback: () => void): number {
    const id = nextFrameId++;
    const timer = setTimeout(() => {
      frameTimers.delete(id);
      callback();
    }, 16);
    frameTimers.set(id, timer);
    return id;
  },
  cancelAnimationFrame(id: number): void {
    const timer = frameTimers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    frameTimers.delete(id);
  },
});

// The Fabric name an adapter resolves `button` to. Built with the NAME and the TAG separately,
// which is what every adapter does — building it with the tag would make the registry key match by
// accident (`host-behavior.ts`, `attached`).
const BUTTON_VIEW_NAME = 'RCTView';
const TEST_ID = 'subject';

const TOUCH: ISymbioteEvent = {
  nativeEvent: { pageX: 0, pageY: 0, locationX: 0, locationY: 0 },
};

function makeButton(): ISymbioteNode {
  return createElement(BUTTON_VIEW_NAME, false, BUTTON_TAG);
}

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

// The LIVE tree, never `fabric.find()`, which keeps every pre-clone node and would report the
// button's own pre-projection self (`.claude/rules/test-harness-false-greens.md`).
function committedByTestId(testID: string): IFakeNode {
  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const hit = walk(fabric.appRoot().children);
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit;
}

// The internal nodes carry no testID of their own — they are the behavior's, not the app's — so
// they are reached through the button found BY testID, one hop at a time, with every view name
// asserted. That is a claim about this primitive's own shape, not "the first RCTView in the tree".
function subtreeOf(testID: string): {
  host: IFakeNode;
  view: IFakeNode;
  text: IFakeNode;
  label: IFakeNode | undefined;
} {
  const host = committedByTestId(testID);
  expect(host.viewName).toBe('RCTView');
  expect(host.children).toHaveLength(1);
  const view = host.children[0];
  expect(view.viewName).toBe('RCTView');
  expect(view.children).toHaveLength(1);
  const text = view.children[0];
  expect(text.viewName).toBe('RCTText');
  const label = text.children[0];
  if (label !== undefined) expect(label.viewName).toBe('RCTRawText');
  return { host, view, text, label };
}

function countNodes(node: IFakeNode): number {
  return 1 + node.children.reduce((sum, kid) => sum + countNodes(kid), 0);
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined)
    throw new Error(`no "${name}" listener — the behavior did not attach`);
  return listener;
}

// A WHOLE gesture, in the engine's own order. `pressOut` is not decoration: it is what clears the
// machine's per-gesture build flag, so a case that opens a gesture and never releases pins the
// FIRST disabled answer forever and a re-enable can never be observed.
function pressAndRelease(node: ISymbioteNode): void {
  listenerOf(node, 'pressIn')(TOUCH);
  listenerOf(node, 'startShouldSetResponder')(TOUCH);
  listenerOf(node, 'press')(TOUCH);
  listenerOf(node, 'pressOut')(TOUCH);
}

// The projection runs inside the slot's fold and publishes through `requestCommitFor`, which
// flushes on a microtask; the fade runs on timers.
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(400);
  await Promise.resolve();
}

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
});

describe('button host behavior', () => {
  it('commits RN’s subtree: touchable > view > text > raw text', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    mount(node);
    await settle();

    const { text, label } = subtreeOf(TEST_ID);
    expect(label?.props.text).toBe('Save');
    // RN's Text.js defaults, which a hand-written host tag inherits from nothing. Without them a
    // long label clips mid-word instead of ellipsising, on device only.
    expect(text.props.ellipsizeMode).toBe('tail');
    expect(text.props.allowFontScaling).toBe(true);
    // `styles.text` flattened into the payload — RN spells the inset as a MARGIN, so the tap
    // target grows rather than the glyphs insetting.
    expect(text.props.textAlign).toBe('center');
    expect(text.props.margin).toBe(8);
  });

  it('keeps title and color off the payload and pins the button role', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'color', '#ff0000');
    mount(node);
    await settle();

    const { host, text } = subtreeOf(TEST_ID);
    // Both are consumed by the behavior and declared by no ViewConfig: Fabric drops an unknown key
    // silently, so the strip is only ever visible here.
    expect(host.props.title).toBeUndefined();
    expect(host.props.color).toBeUndefined();
    expect(host.props.accessibilityRole).toBe('button');
    // RN's `accessible` split: Button forwards raw, the touchable underneath defaults it.
    expect(host.props.accessible).toBe(true);
    // On iOS `color` tints the LABEL, never the button (Button.js:318-324).
    expect(text.props.color).toBe('#ff0000');
  });

  it('re-maps touchSoundDisabled and hides descendants for importantForAccessibility="no"', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'touchSoundDisabled', true);
    routeProp(node, 'importantForAccessibility', 'no');
    mount(node);
    await settle();

    const { host } = subtreeOf(TEST_ID);
    expect(host.props.android_disableSound).toBe(true);
    expect(host.props.touchSoundDisabled).toBeUndefined();
    // Button.js:356 — so the label inside cannot take focus separately from the button.
    expect(host.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('greys the label from aria-disabled and merges accessibilityState', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'accessibilityState', { busy: true });
    routeProp(node, 'aria-disabled', true);
    mount(node);
    await settle();

    const { host, text } = subtreeOf(TEST_ID);
    expect(text.props.color).toBe('#cdcdcd');
    // MERGES: RN keeps busy/checked/expanded/selected and overrides only `disabled`
    // (Button.js:333-338). Nothing in `button.ts` does this — the engine's aria fold and the press
    // fold compose to it, which is the whole reason Button owes no accessibilityState fold.
    expect(host.props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it('re-folds the label when title changes after mount', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    const surface = mount(node);
    await settle();
    expect(subtreeOf(TEST_ID).label?.props.text).toBe('Save');

    routeProp(node, 'title', 'Send');
    surface.commit();
    await settle();

    expect(subtreeOf(TEST_ID).label?.props.text).toBe('Send');
  });

  // The raw text is the SLOT, so `title` reaches it through `routeProp` and lands in `props.text` —
  // which is what `isEmptyRawText` reads. That is the whole reason the label's fold runs over its
  // own props rather than over the owner's: a fold-only label would leave `props.text` at '' and
  // the commit walk would drop the node before the fold ever ran, permanently. The mirror hazard is
  // this case — an empty raw text committed to Fabric aborts inside its text walk.
  it('commits no raw text for an empty title', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', '');
    const surface = mount(node);
    await settle();
    expect(subtreeOf(TEST_ID).text.children).toHaveLength(0);

    // And it comes back: `renderableChildren` clears the dirty flag of a child it skips, so the
    // write that fills the label has to reach the parent on its own.
    routeProp(node, 'title', 'Save');
    surface.commit();
    await settle();

    expect(subtreeOf(TEST_ID).label?.props.text).toBe('Save');
  });

  // The iOS half of the two-node claim: `color` tints the LABEL here and leaves the inner view at
  // its constant `{}`, which is the exact mirror of Android, where it tints the view and leaves the
  // label white. A projection that only ever re-folded the slot the engine marks would pass one of
  // the two and fail the other.
  it('re-tints the label when color changes after mount', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    const surface = mount(node);
    await settle();
    expect(subtreeOf(TEST_ID).text.props.color).toBe('#007AFF');

    routeProp(node, 'color', '#ff0000');
    surface.commit();
    await settle();

    expect(subtreeOf(TEST_ID).text.props.color).toBe('#ff0000');
  });

  it('runs the composed press machine', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const onPress = vi.fn();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'onPress', onPress);
    mount(node);
    await settle();

    // The ENGINE's order: `events/index.ts` bubbles PRESS_IN and only then negotiates the
    // responder, so `pressIn` arrives first on every gesture. `press` is its own engine event, not
    // something `pressOut` synthesises.
    listenerOf(node, 'pressIn')(TOUCH);
    listenerOf(node, 'startShouldSetResponder')(TOUCH);
    listenerOf(node, 'press')(TOUCH);
    await settle();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // WHY THE THREE FOLDS NEED NO MEMO. `resolveButtonTextStyle` / `resolveButtonViewStyle` hand back
  // a FRESH object per call, which under the old `setProp` projection could never satisfy
  // `Object.is` — so it re-dirtied the label on every commit and bought a targeted flush per
  // re-render (`.claude/rules/list-geometry-feedback-loop.md`, one node up). A payload fold reaches
  // `reconcile` instead, which deep-compares with `propsEqual` and hands back the committed handle
  // when nothing moved.
  //
  // Asserted as node IDENTITY in the committed tree, which is exactly "no clone was spent": a fresh
  // but equal `accessibilityState` fails `setProp`'s guard, so all three folds DO re-run.
  it('spends no clone when a re-render hands back an equal accessibilityState', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'accessibilityState', { busy: true });
    const surface = mount(node);
    await settle();
    const before = subtreeOf(TEST_ID);

    // A fresh object with identical contents — what every re-render hands a diffing adapter.
    routeProp(node, 'accessibilityState', { busy: true });
    surface.commit();
    await settle();

    const after = subtreeOf(TEST_ID);
    expect(after.view).toBe(before.view);
    expect(after.text).toBe(before.text);
    expect(after.label).toBe(before.label);
  });

  // THE HEADLINE CLAIM, iOS half. TouchableOpacity WRAPS (TouchableOpacity.js:302,344), so the
  // styled button view is a CHILD and the tree is one node taller than Android's — which
  // `button-android.test.ts` counts at three. Counted rather than eyeballed: `subtreeOf`'s hops
  // prove the shape, this proves nothing is hiding beside it.
  it('commits RN’s four-node iOS subtree, not Android’s three', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    mount(node);
    await settle();

    expect(countNodes(subtreeOf(TEST_ID).host)).toBe(4);
  });

  // The negative arm of the ripple. Both view commands and the background prop are Android's
  // (TouchableNativeFeedback.js:230-252, :343-348), and the fade is what stands in their place
  // here — so an unguarded branch shows up as a command dispatched on a platform that has no
  // ripple drawable to move.
  it('sends no ripple command, carries no ripple background, and fades', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    mount(node);
    await settle();
    fabric.commands.length = 0;

    listenerOf(node, 'pressIn')(TOUCH);
    listenerOf(node, 'startShouldSetResponder')(TOUCH);
    listenerOf(node, 'responderMove')(TOUCH);
    listenerOf(node, 'press')(TOUCH);
    listenerOf(node, 'pressOut')(TOUCH);
    await settle();

    expect(fabric.commands).toHaveLength(0);
    const { host } = subtreeOf(TEST_ID);
    expect(Object.keys(host.props)).not.toContain('nativeBackgroundAndroid');
    // TouchableOpacity's Animated.View carries `{opacity: anim}` from its first render, so a
    // resting button commits the key. Its absence would mean the Android touchable was composed.
    expect(typeof host.props.opacity).toBe('number');
  });

  // TouchableOpacity.js:336 and TouchableNativeFeedback.js:369 hold the SAME expression, so this
  // pair is asserted identically on both platforms. Nothing in `core/components` emitted
  // `focusable` on any path before — not a wrapper, not the press behavior.
  it('focuses only while it has an onPress and is enabled', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    const surface = mount(node);
    await settle();
    // No onPress yet: RN cannot focus a button that does nothing.
    expect(subtreeOf(TEST_ID).host.props.focusable).toBe(false);

    // A listener flip dirties no payload by itself, so this also pins `onOwnedListenerChange`.
    routeProp(node, 'onPress', () => {});
    surface.commit();
    await settle();
    expect(subtreeOf(TEST_ID).host.props.focusable).toBe(true);

    routeProp(node, 'disabled', true);
    surface.commit();
    await settle();
    expect(subtreeOf(TEST_ID).host.props.focusable).toBe(false);
  });

  // Button.js:337 resolves `props.disabled ?? aria-disabled ?? accessibilityState.disabled` and
  // passes the ANSWER down to the touchable, so on a Button — unlike a bare Pressable — either
  // spelling suppresses the press. `pressable.test.ts` pins the other side of that asymmetry.
  it.each([
    ['aria-disabled', 'aria-disabled', true],
    ['accessibilityState.disabled', 'accessibilityState', { disabled: true }],
  ])('suppresses the press from %s alone', async (_name, prop, value) => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const onPress = vi.fn();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'onPress', onPress);
    routeProp(node, prop, value);
    mount(node);
    await settle();

    pressAndRelease(node);
    await settle();

    expect(onPress).not.toHaveBeenCalled();
  });

  // The direction a naive fix inverts. `??` short-circuits on the AUTHOR's value, so an explicit
  // `disabled={false}` outranks any aria/state spelling (Button.js:337) — a resolver that merged
  // the three with `||`, or one that let aria win, would kill a button the app enabled.
  it('lets an explicit disabled={false} beat aria-disabled', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const onPress = vi.fn();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'onPress', onPress);
    routeProp(node, 'aria-disabled', true);
    routeProp(node, 'disabled', false);
    mount(node);
    await settle();

    pressAndRelease(node);
    await settle();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // THE LATCH, and the reason the fix is a resolver rather than a write into `node.props.disabled`:
  // `resolveButtonDisabled` short-circuits on an authored `disabled`, so an injected answer would
  // read back as the app's own and this button would stay dead forever.
  it('presses again after aria-disabled goes back to false', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const onPress = vi.fn();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'onPress', onPress);
    routeProp(node, 'aria-disabled', true);
    const surface = mount(node);
    await settle();

    pressAndRelease(node);
    await settle();
    expect(onPress).not.toHaveBeenCalled();

    routeProp(node, 'aria-disabled', false);
    surface.commit();
    await settle();

    pressAndRelease(node);
    await settle();

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // The FADE half of the same resolution, and it was open for an hour after the press half closed.
  // `afterCommit` re-settles the view when `disabled` moves (RN's componentDidUpdate); reading the
  // raw prop there left an aria-only flip un-settled, so a Button disabled mid-press stayed at its
  // ACTIVE opacity while the press was already suppressed. RN's Button never had the gap — it
  // resolves once and passes the value down as its touchable's own prop (Button.js:331,337).
  it('re-settles the fade when aria-disabled arrives mid-press', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'onPress', vi.fn());
    const surface = mount(node);
    await settle();
    const resting = committedByTestId(TEST_ID).props.opacity;

    // Held down, not released — the fade is at its active value and stays there.
    listenerOf(node, 'pressIn')(TOUCH);
    listenerOf(node, 'startShouldSetResponder')(TOUCH);
    await settle();
    const active = committedByTestId(TEST_ID).props.opacity;
    expect(active).not.toBe(resting);

    routeProp(node, 'aria-disabled', true);
    surface.commit();
    await settle();

    expect(committedByTestId(TEST_ID).props.opacity).toBe(resting);
  });

  // why: the measurement that decided `HOST_PRIMITIVES.Button.aliases`, kept as the guard.
  //
  // BOTH LAYERS, because the composed touchable folds `id` itself and the spec entry folds it too —
  // the arms are the raw bag (what an adapter with no `foldHostBag` in front of it delivers) and
  // the pre-folded one (what every adapter's renderer actually delivers). Identical answers is what
  // says the two compose idempotently: the alias renames on the OWNER, and `Object.hasOwn(next,
  // 'id')` one layer down then finds nothing left to do.
  //
  // The arm that made the entry NECESSARY is on Android, where the touchable is the bare press
  // machine and folds nothing — see `button-android.test.ts`. iOS passes either way, which is
  // exactly why declining the entry looked free.
  it('folds `id` the same whichever layer renamed it', async () => {
    for (const props of [
      { id: 'from-id', nativeID: 'losing-value' },
      foldHostBag(BUTTON_TAG, { id: 'from-id', nativeID: 'losing-value' }),
    ]) {
      vi.useFakeTimers();
      fabric.reset();
      clearHostBehaviors();
      registerButtonBehavior();
      const node = makeButton();
      routeProp(node, 'testID', TEST_ID);
      routeProp(node, 'title', 'Save');
      for (const [key, value] of Object.entries(props))
        routeProp(node, key, value);
      mount(node);
      await settle();

      const { host } = subtreeOf(TEST_ID);
      // RN gives `id` unconditional priority over `nativeID` (View.js:77-79).
      expect(host.props.nativeID).toBe('from-id');
      // A raw `id` is a key no ViewConfig declares, so Fabric drops it and the label is lost with
      // nothing red — the strip is only ever visible here.
      expect(host.props.id).toBeUndefined();
      vi.useRealTimers();
    }
  });

  // The control. Without a registration the tag is a bare view: no subtree, no label, no listener —
  // so every assertion above is answering the behavior and not some engine default.
  it('builds nothing when the behavior is not registered', async () => {
    vi.useFakeTimers();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    mount(node);
    await settle();

    expect(committedByTestId(TEST_ID).children).toHaveLength(0);
    expect(node.listeners?.get('pressIn')).toBeUndefined();
  });
});
