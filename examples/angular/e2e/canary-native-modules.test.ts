import { by, device, element, waitFor } from 'detox';

// Native-module buttons of `CanaryScreen`: StatusBar, Alert, ActionSheetIOS and Vibration
// `Share` and `Linking.openURL` are skipped below, both leave the app

const MAX_SCROLL_STEPS = 15;
const MAX_FRAME_READS = 5;

type IFrame = { x: number; y: number; width: number; height: number };

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// `tap()` runs a Detox hittability pre-check that misfires for several buttons here
// A raw `device.tap(point)` skips it, so tap the centre of the frame read from `getAttributes()`
// Momentum keeps the frame drifting after a scroll, so re-read until two reads agree
async function settledFrame(
  id: string,
  readsLeft: number,
  previous?: IFrame,
): Promise<IFrame> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) {
    throw new Error(`${id}: getAttributes() returned no frame`);
  }
  const { x, y, width, height } = attrs.frame;
  const frame = { x, y, width, height };
  const isSettled =
    previous !== undefined &&
    Math.abs(x - previous.x) < 1 &&
    Math.abs(y - previous.y) < 1;
  if (isSettled || readsLeft <= 1) return frame;
  await sleep(150);
  return settledFrame(id, readsLeft - 1, frame);
}

async function deviceTap(id: string): Promise<void> {
  const frame = await settledFrame(id, MAX_FRAME_READS);
  await device.tap({
    x: frame.x + frame.width / 2,
    y: frame.y + frame.height / 2,
  });
}

// Own copy of the `probe.test.ts` helpers, each e2e file keeps its own
async function scrollUntilVisible(
  id: string,
  stepsLeft: number,
): Promise<void> {
  try {
    await waitFor(element(by.id(id)))
      .toBeVisible()
      .withTimeout(400);
  } catch (error) {
    if (stepsLeft <= 0) throw error;
    await element(by.id('angular-canary-scroll')).scroll(500, 'down');
    return scrollUntilVisible(id, stepsLeft - 1);
  }
}

async function bringIntoView(id: string): Promise<void> {
  await element(by.id('angular-canary-scroll')).scrollTo('top');
  await scrollUntilVisible(id, MAX_SCROLL_STEPS);
  await sleep(300);
}

describe('Angular canary native-module buttons', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into the Canary screen', async () => {
    await waitFor(element(by.id('menu-row-FrameworkHub')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-FrameworkHub')).tap();
    await waitFor(element(by.id('menu-row-Canary')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-Canary')).tap();
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);

    // The next test scrolls at once, so wait for the ScrollView to have real bounds
    await waitFor(element(by.id('angular-canary-scroll')))
      .toBeVisible()
      .withTimeout(10_000);
    await sleep(300);
  });

  it('toggles the status bar hidden state via its own title text', async () => {
    await bringIntoView('angular-status-bar-hidden-btn');
    await element(by.id('angular-status-bar-hidden-btn')).tap();
    await waitFor(element(by.text('Show status bar')))
      .toExist()
      .withTimeout(10_000);

    await bringIntoView('angular-status-bar-hidden-btn');
    await element(by.id('angular-status-bar-hidden-btn')).tap();
    await waitFor(element(by.text('Hide status bar')))
      .toExist()
      .withTimeout(10_000);
  });

  it('toggles the status bar style via its own title text', async () => {
    await bringIntoView('angular-status-bar-style-btn');
    await deviceTap('angular-status-bar-style-btn');
    await waitFor(element(by.text('Light text')))
      .toExist()
      .withTimeout(10_000);

    await bringIntoView('angular-status-bar-style-btn');
    await deviceTap('angular-status-bar-style-btn');
    await waitFor(element(by.text('Dark text')))
      .toExist()
      .withTimeout(10_000);
  });

  // The button renders only under `@if (Platform.OS === 'android')`, absent on an iOS run
  // Guarded at runtime, not skipped, so an Android run picks it up
  it('toggles the status bar background color on Android only', async () => {
    if (device.getPlatform() !== 'android') return;

    await bringIntoView('angular-status-bar-bg-btn');
    await element(by.id('angular-status-bar-bg-btn')).tap();
    await waitFor(element(by.text('BG default')))
      .toExist()
      .withTimeout(10_000);
  });

  // Same Android-only guard for `angular-status-bar-translucent-btn`
  it('toggles status bar translucency on Android only', async () => {
    if (device.getPlatform() !== 'android') return;

    await bringIntoView('angular-status-bar-translucent-btn');
    await element(by.id('angular-status-bar-translucent-btn')).tap();
    await waitFor(element(by.text('Opaque')))
      .toExist()
      .withTimeout(10_000);
  });

  it('opens the native Alert and dismisses it via Cancel', async () => {
    await bringIntoView('angular-alert-btn');
    await deviceTap('angular-alert-btn');
    await waitFor(element(by.text('Cancel')))
      .toBeVisible()
      .withTimeout(10_000);

    // Cancel only, Vibrate is a live device action and not under test
    await element(by.text('Cancel')).tap();
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });

  // The button renders only under `@if (Platform.OS !== 'android')`
  it('opens the native action sheet and dismisses it via Cancel', async () => {
    await bringIntoView('angular-action-sheet-btn');
    await deviceTap('angular-action-sheet-btn');
    await waitFor(element(by.text('Cancel')))
      .toBeVisible()
      .withTimeout(10_000);

    // Cancel only, Share and Vibrate are live actions and not under test
    await element(by.text('Cancel')).tap();
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });

  // SKIPPED: `Share.share` opens a system sheet whose buttons vary by iOS version and apps
  // Detox has no stable way to drive or dismiss it
  it.skip('shares content via the native share sheet', async () => {
    await bringIntoView('angular-share-btn');
    await element(by.id('angular-share-btn')).tap();
  });

  // SKIPPED: `Linking.openURL` backgrounds the app into Safari, which Detox cannot control
  it.skip('opens an external URL via Linking.openURL', async () => {
    await bringIntoView('angular-open-url-btn');
    await element(by.id('angular-open-url-btn')).tap();
  });

  it('vibrates without crashing the app', async () => {
    await bringIntoView('angular-vibrate-btn');
    await deviceTap('angular-vibrate-btn');
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });
});
