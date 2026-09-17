// Button as a tag. The default (iOS) half: the subtree the behavior builds, the folds the wrapper
// used to run, and the press machine it composes. The two-node re-fold is only OBSERVABLE on
// Android — `resolveButtonViewStyle` returns the same constant for every input off it — so it lives
// in `button-android.test.ts`, beside its own Platform mock.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '../../../test-utils/src/index';
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

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
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

// The LIVE tree — `appRoot()` searches the CREATION log, so `fabric.reset()` runs per case
// (`beforeEach` below) or a stale case's node would answer here instead.
function committedByTestId(testID: string): ILiveNode {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit;
}

// The internal nodes carry no testID of their own — they are the behavior's, not the app's — so
// they are reached through the button found BY testID, one hop at a time, with every view name
// asserted. That is a claim about this primitive's own shape, not "the first RCTView in the tree".
function subtreeOf(testID: string): {
  host: ILiveNode;
  view: ILiveNode;
  text: ILiveNode;
  label: ILiveNode | undefined;
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

function countNodes(node: ILiveNode): number {
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

beforeEach(() => {
  // `appRoot()` searches the CREATION log, and every case here opens its OWN surface — without
  // this a case reuses the FIRST case's tree.
  fabric.reset();
});

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
    expect(label?.payload.text).toBe('Save');
    // RN's Text.js defaults, which a hand-written host tag inherits from nothing. Without them a
    // long label clips mid-word instead of ellipsising, on device only.
    expect(text.payload.ellipsizeMode).toBe('tail');
    expect(text.payload.allowFontScaling).toBe(true);
    // `styles.text` flattened into the payload — RN spells the inset as a MARGIN, so the tap
    // target grows rather than the glyphs insetting.
    expect(text.payload.textAlign).toBe('center');
    expect(text.payload.margin).toBe(8);
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
    // `title` is redirected by `SLOT_PROPS` before it can land here, which is a REDIRECT and stays
    // observable from this host. Its neighbour `color` is a strip and is not: that, the role, the
    // `touchSoundDisabled` rename and the `importantForAccessibility` promotion are all
    // `foldButtonProps` in the engine now, and this host builds its payload through the TypeScript
    // `fabricProps`, which carries no copy of the tag rules. All four are asserted against the
    // committed payload in `core/engine/cpp/tests/js/button-payload.itest.ts`.
    //
    // They moved as a GROUP with the two strips rather than one at a time. An absence assertion left
    // on a harness that can no longer produce the key passes forever for the wrong reason — the
    // false green the text-input port was caught by.
    expect(host.payload.title).toBeUndefined();
    // On iOS `color` tints the LABEL, never the button (Button.js:318-324) — and THAT half is still
    // this file's, because the label's fold reads `propsOf(node)` and never the stripped payload.
    expect(text.payload.color).toBe('#ff0000');
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
    expect(text.payload.color).toBe('#cdcdcd');
    // MERGES: RN keeps busy/checked/expanded/selected and overrides only `disabled`
    // (Button.js:333-338). Nothing in `button.ts` does this — the engine's aria fold and the press
    // fold compose to it, which is the whole reason Button owes no accessibilityState fold.
    expect(host.payload.accessibilityState).toMatchObject({
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
    expect(subtreeOf(TEST_ID).label?.payload.text).toBe('Save');

    routeProp(node, 'title', 'Send');
    surface.commit();
    await settle();

    expect(subtreeOf(TEST_ID).label?.payload.text).toBe('Send');
  });

  // The raw text is the SLOT, so `title` reaches it through `routeProp` and lands in `props.text` —
  // which is what `isEmptyRawText` reads. That is the whole reason the label's fold runs over its
  // own props rather than over the owner's: a fold-only label would leave `props.text` at '' and
  // the commit walk would drop the node before the fold ever ran, permanently.
  //
  // THE DROP ITSELF IS A REAL-FABRIC-COMMIT-ONLY RULE (`AttributedString::appendFragment` skips an
  // empty fragment) — neither the recording host nor the live tree performs it, so the node this
  // reads stays present with `text === ''` rather than vanishing. That half of the original claim
  // ("nothing paints for an empty title") is therefore NOT verified here; it needs an itest against
  // the real commit walk, which does not exist yet for this case. What IS verified: the label is
  // updated in place and comes back once the title is non-empty again.
  it('holds the raw text node empty for an empty title, and re-fills it', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', '');
    const surface = mount(node);
    await settle();
    const empty = subtreeOf(TEST_ID);
    expect(empty.text.children).toHaveLength(1);
    expect(empty.label?.payload.text).toBe('');

    routeProp(node, 'title', 'Save');
    surface.commit();
    await settle();

    expect(subtreeOf(TEST_ID).label?.payload.text).toBe('Save');
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
    expect(subtreeOf(TEST_ID).text.payload.color).toBe('#007AFF');

    routeProp(node, 'color', '#ff0000');
    surface.commit();
    await settle();

    expect(subtreeOf(TEST_ID).text.payload.color).toBe('#ff0000');
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
  // but equal `accessibilityState` fails `setProp`'s guard, so all three folds DO re-run. Compared
  // by HANDLE — `ILiveNode.children` is a getter that builds a fresh object per read, so `===` on
  // two live nodes is always false.
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
    expect(after.view.handle).toBe(before.view.handle);
    expect(after.text.handle).toBe(before.text.handle);
    expect(after.label?.handle).toBe(before.label?.handle);
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
    expect(Object.keys(host.payload)).not.toContain('nativeBackgroundAndroid');
    // TouchableOpacity's Animated.View carries `{opacity: anim}` from its first render, so a
    // resting button commits the key. Its absence would mean the Android touchable was composed.
    expect(typeof host.payload.opacity).toBe('number');
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
    expect(subtreeOf(TEST_ID).host.payload.focusable).toBe(false);

    // A listener flip dirties no payload by itself, so this also pins `onOwnedListenerChange`.
    routeProp(node, 'onPress', () => {});
    surface.commit();
    await settle();
    expect(subtreeOf(TEST_ID).host.payload.focusable).toBe(true);

    routeProp(node, 'disabled', true);
    surface.commit();
    await settle();
    expect(subtreeOf(TEST_ID).host.payload.focusable).toBe(false);
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
    const resting = committedByTestId(TEST_ID).payload.opacity;

    // Held down, not released — the fade is at its active value and stays there.
    listenerOf(node, 'pressIn')(TOUCH);
    listenerOf(node, 'startShouldSetResponder')(TOUCH);
    await settle();
    const active = committedByTestId(TEST_ID).payload.opacity;
    expect(active).not.toBe(resting);

    routeProp(node, 'aria-disabled', true);
    surface.commit();
    await settle();

    expect(committedByTestId(TEST_ID).payload.opacity).toBe(resting);
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
  //
  // ONE ARM LEFT, and dropping the other is the point rather than a concession. The alias is
  // `foldIdAlias` in the engine now, applied to every tagged node, and this host builds its payloads
  // through the TypeScript `fabricProps`, which carries no copy — so the RAW arm can no longer be
  // asked here and is asked in `core/engine/cpp/tests/js/touchable-payload.itest.ts` instead. What
  // survives is the half that is still JS: `foldHostBag` renaming on the way in, and the engine
  // finding nothing left to do afterwards. That is the composition this test existed for.
  it('folds `id` the same whichever layer renamed it', async () => {
    for (const props of [
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
      expect(host.payload.nativeID).toBe('from-id');
      // A raw `id` is a key no ViewConfig declares, so Fabric drops it and the label is lost with
      // nothing red — the strip is only ever visible here.
      expect(host.payload.id).toBeUndefined();
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
