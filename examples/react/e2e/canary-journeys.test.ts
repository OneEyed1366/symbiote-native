import { readFileSync } from 'fs';
import { by, device, element, expect, waitFor } from 'detox';

// Canary user-journey e2e. Detox attaches at the stock RN host BELOW the renderer symbiote
// replaces, so this exact spec is framework-agnostic: the identical file runs against the
// React, Vue-TSX and Vue-SFC canaries — all three render the same surface with the same testIDs.
// Each journey drives a real native interaction and asserts the outcome of ONE component
// A component that mounts but misbehaves (a frozen `Animated` view) fails here, not `toBeVisible`
//
// Sync is OFF from the first launch: the canary runs a perpetual native Animated.loop heartbeat
// (offloaded to the UI thread, so JS never reports idle) which would otherwise hang launchApp
// waiting for idle; detoxEnableSynchronization:0 via launchArgs is the same gate the attach probe
// uses.

const launchOpts = {
  newInstance: true,
  launchArgs: { detoxEnableSynchronization: 0 },
};

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const PAGE_TOP_SLACK = 50;
const BIG_SCROLL_UP = 12_000;
// A swipe that starts on a nested list scrolls that list, so start on the page's left padding
const SWIPE_START_X = 0.03;
let pageTop = 0;

async function frameTop(id: string): Promise<number> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('frame' in attrs && attrs.frame !== undefined) return attrs.frame.y;
  throw new Error(`${id} reports no frame, so the scroll position is unknown`);
}

// Android `scrollTo('top')` from deep down can end in "Scrolling a lot without reaching the edge"
// One oversized scroll up gets there, but at the top it pulls to refresh, so a scrolled page only
async function returnToTop(): Promise<void> {
  const isAndroid = device.getPlatform() === 'android';
  const topLimit = pageTop - PAGE_TOP_SLACK;
  if (isAndroid && (await frameTop('counter-card')) >= topLimit) return;
  const scroller = element(by.id('canary-scroll'));
  await (isAndroid
    ? scroller.scroll(BIG_SCROLL_UP, 'up', NaN, 0.2)
    : scroller.scrollTo('top'));
  await sleep(500);
  const isAtTop = (await frameTop('counter-card')) >= topLimit;
  if (!isAtTop)
    throw new Error('the scroll up did not reach the top of the page');
}

// Walks down from the top until the target shows, since demos sit at different depths
// A `startY` of 0.8 keeps the swipe start above the safe area, and the swipe drifts on, so settle
async function bringIntoView(id: string): Promise<void> {
  await returnToTop();
  await waitFor(element(by.id(id)))
    .toBeVisible()
    .whileElement(by.id('canary-scroll'))
    .scroll(300, 'down', SWIPE_START_X, 0.8);
  await sleep(300);
}

// Detox surfaces an element's text via getAttributes(). The return is a union — one element
// ({text,label,…}) or many ({elements:[…]}) — so narrow with `in` instead of casting.
async function elementText(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text;
  return '';
}

// Poll an element's text until it matches (Detox waitFor has no text-predicate form). Used for the
// async readouts (Image.getSize resolving, measure() writing the frame) that settle after a beat.
async function waitForText(
  id: string,
  matches: (text: string) => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const poll = async (): Promise<void> => {
    const text = await elementText(id);
    if (matches(text)) return;
    if (Date.now() >= deadline) {
      throw new Error(
        `${id} never matched within ${timeoutMs}ms; last text was "${text}"`,
      );
    }
    await sleep(250);
    return poll();
  };
  return poll();
}

// Sync is off, so `dtx_assertHittableAtPoint` can throw "not hittable" for a moment after recommit
// The view is on screen and updated (a screenshot at the failure shows it), so retry
async function tapWithRetry(id: string, attempts = 3): Promise<void> {
  try {
    await element(by.id(id)).tap();
  } catch (error) {
    if (attempts <= 1) throw error;
    await sleep(300);
    return tapWithRetry(id, attempts - 1);
  }
}

// Animation liveness WITHOUT reading opacity/transform from JS (impossible for a native-driven
// value — the frames live on the UI thread). element().takeScreenshot crops to THIS component and
// resolves to a PNG path; two crops that differ byte-for-byte prove motion, identical crops prove a
// freeze. This is what catches the static-circle class on-device. Element screenshots are solid on
// iOS; on Android whether they crop to the element or the whole screen depends on the installed
// Detox version, so treat any Android false negative here first.
async function elementShot(id: string, name: string): Promise<Buffer> {
  const path = await element(by.id(id)).takeScreenshot(name);
  return readFileSync(path);
}

// Android crops follow the view, so a moved dot crops the same, but `frame` and `alpha` change
async function viewState(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  const frame = 'frame' in attrs ? JSON.stringify(attrs.frame) : '';
  const alpha = 'alpha' in attrs ? String(attrs.alpha) : '';
  return `${frame}|${alpha}`;
}

// "Animating" = any consecutive pair of 3 samples over ~500ms differs. Three samples (not two)
// avoid a false freeze when one sample lands on the momentary peak/trough of the breathe curve,
// where scale is instantaneously flat.
async function assertAnimating(id: string): Promise<void> {
  const firstShot = await elementShot(id, `${id}-anim-0`);
  const firstState = await viewState(id);
  await sleep(250);
  const secondShot = await elementShot(id, `${id}-anim-1`);
  const secondState = await viewState(id);
  await sleep(250);
  const thirdShot = await elementShot(id, `${id}-anim-2`);
  const thirdState = await viewState(id);
  const areShotsAlike =
    firstShot.equals(secondShot) && secondShot.equals(thirdShot);
  const areStatesAlike =
    firstState === secondState && secondState === thirdState;
  if (areShotsAlike && areStatesAlike) {
    throw new Error(
      `${id} is not animating: 3 samples over 500ms had identical crops, frame and alpha (frozen)`,
    );
  }
}

// A one-shot move: snapshot the dot, tap the trigger, let the curve settle, snapshot again
// Same crop and same `frame` / `alpha` = the view never moved (tap-driven slide/track bug class)
async function assertTapMoves(triggerId: string, dotId: string): Promise<void> {
  const before = await elementShot(dotId, `${dotId}-before`);
  const stateBefore = await viewState(dotId);
  await element(by.id(triggerId)).tap();
  await sleep(900); // the slide/spring curves run ~600-700ms; settle past the end
  const after = await elementShot(dotId, `${dotId}-after`);
  if (before.equals(after) && stateBefore === (await viewState(dotId))) {
    throw new Error(
      `${dotId} did not move after tapping ${triggerId}: before/after screenshots identical`,
    );
  }
}

// Same before/after element screenshot as assertTapMoves, for a change that is a REPAINT rather
// than a motion: a class whose style resolves differently after the tap. Separate name because a
// failure means something else — the style did not resolve, not that an animation froze.
async function assertTapRepaints(
  triggerId: string,
  targetId: string,
): Promise<void> {
  const before = await elementShot(targetId, `${targetId}-before-class`);
  await tapWithRetry(triggerId);
  await sleep(400);
  const after = await elementShot(targetId, `${targetId}-after-class`);
  if (before.equals(after)) {
    throw new Error(
      `${targetId} looks identical after tapping ${triggerId}: the compound class rule never resolved`,
    );
  }
}

describe('symbiote canary · user journeys', () => {
  beforeAll(async () => {
    await device.launchApp(launchOpts);
    // App.tsx boots on the navigation demo Menu screen (@symbiote-native/navigation's Stack) —
    // push into "Canary" first, the screen carrying every testID below.
    await waitFor(element(by.id('menu-row-FrameworkHub')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-FrameworkHub')).tap();
    await waitFor(element(by.id('menu-row-Canary')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-Canary')).tap();
    // Sync is OFF, so nothing waits for the first commit
    // Gate on `canary-scroll` existing, or the first `scroll` of a journey races the launch
    await waitFor(element(by.id('canary-scroll')))
      .toExist()
      .withTimeout(30_000);
    pageTop = await frameTop('counter-card');
  });

  // ---- pre-existing journeys (kept) -----------------------------------------------------------

  // TODO: restore the `counter-card` case; on iOS the card is `hittable=false` after one tap
  // A `<pressable>` is not affected, cause not found (branch or RN is unproven)

  it('typing a name updates the greeting (controlled TextInput)', async () => {
    await bringIntoView('greeting-input');
    await element(by.id('greeting-input')).tap();
    await element(by.id('greeting-input')).typeText('Ada');
    await waitForText('greeting-output', text => text === 'Hello, Ada', 3_000);
    await expect(element(by.id('greeting-output'))).toHaveText('Hello, Ada');
    await element(by.id('greeting-input')).clearText();
    await waitForText(
      'greeting-output',
      text => text === 'Hello, stranger',
      3_000,
    );
    await expect(element(by.id('greeting-output'))).toHaveText(
      'Hello, stranger',
    );
    // The keyboard stays up and covers the point where the next walk starts
    await element(by.id('greeting-input')).tapReturnKey();
  });

  it('opens and closes the Modal', async () => {
    await bringIntoView('modal-open');
    await element(by.id('modal-open')).tap();
    await waitFor(element(by.id('modal-card')))
      .toBeVisible()
      .withTimeout(5_000);
    // On iOS a close tap right after the card shows leaves it open, after 2 s it closes
    await sleep(2_000);
    await element(by.id('modal-close')).tap();
    await waitFor(element(by.id('modal-card')))
      .not.toBeVisible()
      .withTimeout(5_000);
  });

  it('responder chip survives a native-tap recommit', async () => {
    await bringIntoView('resp-chip-0');
    await element(by.id('resp-chip-0')).tap();
    await expect(element(by.id('resp-chip-0'))).toBeVisible();
  });

  // ---- Switch drives a sibling component ------------------------------------------------------

  // Only the inner indicator hides, the container with the `testID` stays visible
  const INDICATOR_TYPE = {
    android: 'android.widget.ProgressBar',
    ios: 'UIActivityIndicatorView',
  } as const;
  const spinner = () =>
    element(
      by
        .type(
          INDICATOR_TYPE[
            device.getPlatform() === 'android' ? 'android' : 'ios'
          ],
        )
        .withAncestor(by.id('spinner-indicator')),
    );

  it('Switch toggles the ActivityIndicator visibility', async () => {
    await bringIntoView('spinner-switch');
    await expect(spinner()).toBeVisible();
    await element(by.id('spinner-switch')).tap();
    await waitFor(spinner()).not.toBeVisible().withTimeout(5_000);
    await element(by.id('spinner-switch')).tap();
    await waitFor(spinner()).toBeVisible().withTimeout(5_000);
  });

  // ---- Animated liveness: the static-circle regression class ----------------------------------

  it('native-driven pulse keeps animating (not frozen)', async () => {
    await bringIntoView('pulse-dot');
    await assertAnimating('pulse-dot');
  });

  it('JS-driver slide moves on tap', async () => {
    await bringIntoView('slide-js-btn');
    await assertTapMoves('slide-js-btn', 'slide-js-dot');
  });

  it('native-driver slide moves on tap', async () => {
    await bringIntoView('slide-native-btn');
    await assertTapMoves('slide-native-btn', 'slide-native-dot');
  });

  it('tracking follower chases the lead on tap', async () => {
    await bringIntoView('track-btn');
    await assertTapMoves('track-btn', 'follow-dot');
  });

  // ---- NativeModules / Image statics / imperative ref -----------------------------------------

  it('persisting a tap changes the stored counter (Settings round-trip)', async () => {
    await bringIntoView('persist-btn');
    const before = await elementText('persist-count');
    await element(by.id('persist-btn')).tap();
    // The readout is "persisted taps: N · survives relaunch"; N bumps, so the whole string changes.
    await waitForText(
      'persist-count',
      text => text !== before && text.length > 0,
      5_000,
    );
  });

  // TODO: restore the `Image.getSize` case (`logo-size` readout) once the emulator has DNS
  // It failed on Android with `UnknownHostException` for `reactnative.dev`, and passed on iOS

  it('imperative measure writes the on-screen frame', async () => {
    await bringIntoView('measure-btn');
    await element(by.id('measure-btn')).tap();
    // The readout gains "in parent x123 y456 · …" once measure() resolves the live frame.
    await waitForText(
      'measure-frame',
      text => /x-?\d+ y-?\d+/.test(text),
      5_000,
    );
  });

  // ---- virtualized lists render and commit on-device ------------------------------------------

  it('chips FlatList renders and is visible', async () => {
    await bringIntoView('chips-list');
    await expect(element(by.id('chips-list'))).toBeVisible();
  });

  it('sticky SectionList renders and is visible', async () => {
    await bringIntoView('sticky-section-list');
    await expect(element(by.id('sticky-section-list'))).toBeVisible();
  });

  // ---- compound class rule: .badge.loud layers over .badge --------------------------------

  it('repaints the badge when the second class is added (compound rule resolves)', async () => {
    await bringIntoView('compound-badge-toggle');
    await expect(element(by.id('compound-badge-plain'))).toBeVisible();
    await expect(element(by.id('compound-badge-loud'))).toBeVisible();
    // `.loud` has no standalone rule, and this badge's LABEL never changes, so the ONLY thing
    // that can alter its pixels is `.badge.loud` resolving. Identical crops = the rule is dead.
    await assertTapRepaints('compound-badge-toggle', 'compound-badge-dynamic');
    await waitForText(
      'compound-badge-readout',
      text => text.includes('both tokens'),
      3_000,
    );
    // Restore, so a later journey does not inherit this screen's toggled state.
    await tapWithRetry('compound-badge-toggle');
  });
});
