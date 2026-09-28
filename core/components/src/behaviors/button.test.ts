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
import { RESTING_OPACITY } from '../state/touchable';

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
    // The component name is the witness: asserting `RCTText` says "whatever `buildStructure`
    // built gets defaulted" without restating the defaulting rule itself.
    expect(text.viewName).toBe('RCTText');
    // The label's whole style is `foldButtonLabelStyle` in C++ now; this host's `fabricProps`
    // carries no copy — pinned in `core/engine/cpp/tests/js/button-derived-payload.itest.ts`.
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

    const { host } = subtreeOf(TEST_ID);
    // `title` redirects via `SLOT_PROPS`, observable here; `color`, role, `touchSoundDisabled`
    // rename and `importantForAccessibility` are `foldButtonProps` in C++ now — asserted in
    // `core/engine/cpp/tests/js/button-payload.itest.ts`.
    expect(host.payload.title).toBeUndefined();
    // On iOS `color` tints the LABEL, never the button (Button.js:318-324) — now
    // `foldButtonLabelStyle` reading the button through `IAncestorLookup`, pinned in
    // `button-derived-payload.itest.ts`.
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

    const { host } = subtreeOf(TEST_ID);
    // The GREY from `aria-disabled` is `foldButtonLabelStyle` (`button-derived-payload.itest.ts`);
    // the accessibilityState MERGE is the engine's aria fold + press fold composing
    // (`button-payload.itest.ts`). This test only proves the props arrive on the node those read.
    expect(host.payload.accessibilityState).toEqual({ busy: true });
    expect(host.payload['aria-disabled']).toBe(true);
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

  // NOTE: Fabric's own drop of an empty fragment (`AttributedString::appendFragment`) is not
  // performed by this harness, so the node stays present with `text === ''`. What is verified here
  // is only that the label updates in place and comes back once the title is non-empty again
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

  // On iOS `color` tints the LABEL and leaves the inner view at its constant `{}`, the mirror of
  // Android. Both arms live in `button-derived-payload.itest.ts`, т.к. this harness's
  // `fabricProps` carries no copy of the fold

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

  // The folds hand back a FRESH object per call, so they all re-run; `reconcile` deep-compares with
  // `propsEqual` and reuses the committed handle. Compared by HANDLE, т.к. `ILiveNode.children` is
  // a getter building a fresh object per read
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

  // TouchableOpacity WRAPS (TouchableOpacity.js:302,344), so the styled button view is a CHILD and
  // the tree is one node taller than Android's, which `button-android.test.ts` counts at three
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

  // Ripple commands and `nativeBackgroundAndroid` are Android's alone
  // (TouchableNativeFeedback.js:230-252, :343-348); on iOS the fade stands in their place
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

  // `focusable` is `foldButtonProps` in C++ now (`button-payload.itest.ts`); what stays in JS is
  // `onPress !== undefined`, т.к. only its EXISTENCE crosses

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

  // `afterCommit` re-settles the view when `disabled` moves, and `aria-disabled` is one of the
  // three props that decide it (Button.js:331,337)
  it('re-settles the fade when aria-disabled arrives mid-press', async () => {
    vi.useFakeTimers();
    registerButtonBehavior();
    const node = makeButton();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'title', 'Save');
    routeProp(node, 'onPress', vi.fn());
    const surface = mount(node);
    await settle();
    // An untouched button publishes no `opacity` at all, so the resting value is the constant
    expect(committedByTestId(TEST_ID).payload.opacity).toBe(undefined);

    // Held down, not released — the fade is at its active value and stays there.
    listenerOf(node, 'pressIn')(TOUCH);
    listenerOf(node, 'startShouldSetResponder')(TOUCH);
    await settle();
    const active = committedByTestId(TEST_ID).payload.opacity;
    expect(active).not.toBe(RESTING_OPACITY);

    routeProp(node, 'aria-disabled', true);
    surface.commit();
    await settle();

    expect(committedByTestId(TEST_ID).payload.opacity).toBe(RESTING_OPACITY);
  });

  // why: a Button's name must reach its OWNER, and `id` beats a `nativeID` written beside it —
  // the rename is `routeProp`'s alone now (see `button-android.test.ts` for the Android arm
  // that makes it necessary; iOS passes either way).
  it('folds `id` to `nativeID`, with id winning', async () => {
    for (const props of [{ id: 'from-id', nativeID: 'losing-value' }]) {
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
