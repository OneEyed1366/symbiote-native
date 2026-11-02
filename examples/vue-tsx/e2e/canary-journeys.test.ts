import { readFileSync } from 'fs';
import { by, device, element, expect, waitFor } from 'detox';

// Canary user journeys: Detox attaches below the renderer, so one spec runs on every canary
// Each journey asserts the outcome of one component, so a frozen `Animated` view fails here

// Sync is off from launch, the `Animated.loop` heartbeat keeps the app from ever going idle
const launchOpts = {
  newInstance: true,
  launchArgs: { detoxEnableSynchronization: 0 },
};

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// Each journey scrolls to its target, `startY` 0.8 keeps the swipe start above the safe area
// Momentum keeps drifting after `scroll` resolves, so settle before a tap
async function bringIntoView(id: string): Promise<void> {
  await waitFor(element(by.id(id)))
    .toBeVisible()
    .whileElement(by.id('canary-scroll'))
    .scroll(300, 'down', NaN, 0.8);
  await sleep(300);
}

// `getAttributes()` returns one element or many, so narrow with `in` instead of casting
async function elementText(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text;
  return '';
}

// Polls the text, since Detox `waitFor` has no text predicate
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

// Sync is off, so a tap right after a recommit can fail with "not hittable", retry past it
async function tapWithRetry(id: string, attempts = 3): Promise<void> {
  try {
    await element(by.id(id)).tap();
  } catch (error) {
    if (attempts <= 1) throw error;
    await sleep(300);
    return tapWithRetry(id, attempts - 1);
  }
}

// A native-driven value cannot be read from JS, so liveness is compared as element screenshots
// Android may crop to the whole screen instead of the element, depending on the Detox version
async function elementShot(id: string, name: string): Promise<Buffer> {
  const path = await element(by.id(id)).takeScreenshot(name);
  return readFileSync(path);
}

// Three samples over 500ms avoid a false freeze when one lands on the flat peak of the curve
async function assertAnimating(id: string): Promise<void> {
  const a = await elementShot(id, `${id}-anim-0`);
  await sleep(250);
  const b = await elementShot(id, `${id}-anim-1`);
  await sleep(250);
  const c = await elementShot(id, `${id}-anim-2`);
  if (a.equals(b) && b.equals(c)) {
    throw new Error(
      `${id} is not animating: 3 element screenshots over 500ms were identical (frozen)`,
    );
  }
}

// Identical screenshots before and after the trigger mean the animation never moved the view
async function assertTapMoves(triggerId: string, dotId: string): Promise<void> {
  const before = await elementShot(dotId, `${dotId}-before`);
  await element(by.id(triggerId)).tap();
  await sleep(900); // the slide/spring curves run ~600-700ms; settle past the end
  const after = await elementShot(dotId, `${dotId}-after`);
  if (before.equals(after)) {
    throw new Error(
      `${dotId} did not move after tapping ${triggerId}: before/after screenshots identical`,
    );
  }
}

// Same as `assertTapMoves` for a repaint, a failure here means the style did not resolve
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
    // The app boots on the Menu, so open the Framework hub and push into "Canary" first
    await waitFor(element(by.id('menu-row-FrameworkHub')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-FrameworkHub')).tap();
    await waitFor(element(by.id('menu-row-Canary')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-Canary')).tap();
    // Sync is off, so gate on `canary-scroll` or the first `scroll` of a journey races the launch
    await waitFor(element(by.id('canary-scroll')))
      .toExist()
      .withTimeout(30_000);
  });

  // ---- pre-existing journeys (kept) -----------------------------------------------------------

  it('counter card increments on each tap (event -> recommit)', async () => {
    await bringIntoView('counter-card');
    await expect(element(by.id('counter-value'))).toHaveText('tapped 0×');
    // Sync is off, so a bare `expect` right after the tap races the recommit
    await tapWithRetry('counter-card');
    await waitForText('counter-value', text => text === 'tapped 1×', 3_000);
    await tapWithRetry('counter-card');
    await waitForText('counter-value', text => text === 'tapped 2×', 3_000);
  });

  it('typing a name updates the greeting (controlled TextInput)', async () => {
    await bringIntoView('greeting-input');
    await element(by.id('greeting-input')).tap();
    await element(by.id('greeting-input')).typeText('Ada');
    await expect(element(by.id('greeting-output'))).toHaveText('Hello, Ada');
    await element(by.id('greeting-input')).clearText();
    await expect(element(by.id('greeting-output'))).toHaveText(
      'Hello, stranger',
    );
  });

  it('opens and closes the Modal', async () => {
    await bringIntoView('modal-open');
    await element(by.id('modal-open')).tap();
    await waitFor(element(by.id('modal-card')))
      .toBeVisible()
      .withTimeout(5_000);
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

  it('Switch toggles the ActivityIndicator visibility', async () => {
    await bringIntoView('spinner-switch');
    await expect(element(by.id('spinner-indicator'))).toBeVisible();
    await element(by.id('spinner-switch')).tap();
    await waitFor(element(by.id('spinner-indicator')))
      .not.toBeVisible()
      .withTimeout(5_000);
    await element(by.id('spinner-switch')).tap();
    await waitFor(element(by.id('spinner-indicator')))
      .toBeVisible()
      .withTimeout(5_000);
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
    await bringIntoView('persist-count');
    const before = await elementText('persist-count');
    await element(by.id('persist-btn')).tap();
    // The readout carries a counter that bumps, so the whole string changes
    await waitForText(
      'persist-count',
      text => text !== before && text.length > 0,
      5_000,
    );
  });

  it('Image.getSize resolves the logo dimensions', async () => {
    await bringIntoView('logo-size');
    // The readout turns into the logo width and height once the image loader answers
    await waitForText(
      'logo-size',
      text => /logo size: \d+×\d+px/.test(text),
      10_000,
    );
  });

  it('imperative measure writes the on-screen frame', async () => {
    await bringIntoView('measure-btn');
    await element(by.id('measure-btn')).tap();
    // The readout gains the frame once `measure()` resolves
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
    // The label never changes and `.loud` has no rule of its own, so only `.badge.loud` repaints it
    await assertTapRepaints('compound-badge-toggle', 'compound-badge-dynamic');
    await waitForText(
      'compound-badge-readout',
      text => text.includes('both tokens'),
      3_000,
    );
    // Restore the toggle so a later journey does not inherit it
    await tapWithRetry('compound-badge-toggle');
  });
});
