import { by, device, element, waitFor } from 'detox';

// Go/no-go probe: a Fabric view from the Angular template reaches the native tree with its `testID`
// The app boots on the Menu, so the probe opens the Framework hub and pushes into `Canary` first

const MAX_SCROLL_STEPS = 15;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Sync is off, so a below-the-fold target exists but is not hittable until it is scrolled to
// Steps down by a fixed distance, `scrollTo('bottom')` overshoots targets above the screen end
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

// Momentum keeps drifting after the scroll resolves, so a settle delay follows
async function bringIntoView(id: string): Promise<void> {
  await element(by.id('angular-canary-scroll')).scrollTo('top');
  await scrollUntilVisible(id, MAX_SCROLL_STEPS);
  await sleep(300);
}

describe('Angular symbiote attach probe', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into the Canary screen through Fabric', async () => {
    // `toExist` races the layout pass, the row can exist a beat before it is hittable
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
  });

  it('renders Angular text content through Fabric', async () => {
    await waitFor(element(by.id('angular-platform')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders an Angular Image component through Fabric', async () => {
    await waitFor(element(by.id('angular-image')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders an additional Angular host intrinsic through Fabric', async () => {
    await waitFor(element(by.id('angular-spinner-indicator')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders the Angular Switch component through Fabric', async () => {
    await waitFor(element(by.id('angular-spinner-switch')))
      .toExist()
      .withTimeout(10_000);
  });

  it('recommits after an Angular press handler updates state', async () => {
    await bringIntoView('angular-counter-card');
    await element(by.id('angular-counter-card')).tap();
    await waitFor(element(by.text('tapped 1×')))
      .toExist()
      .withTimeout(10_000);
  });

  // SKIPPED: Detox reports `angular-open-modal` non-hittable, a raw coordinate tap reaches it
  // Upstream issue (wix/Detox #3130, #4747, #2229), likely worsened by the nested FlatLists
  // Re-enable once it is fixed upstream or the FlatLists leave the ScrollView
  it.skip('opens and closes an Angular Modal through Fabric', async () => {
    await bringIntoView('angular-open-modal');
    await element(by.id('angular-open-modal')).tap();
    await waitFor(element(by.id('angular-modal-card')))
      .toExist()
      .withTimeout(10_000);
    await element(by.id('angular-close-modal')).tap();
    await waitFor(element(by.id('angular-modal-card')))
      .not.toExist()
      .withTimeout(10_000);
  });

  it('renders the Angular KeyboardAvoidingView toggle demo through Fabric', async () => {
    await waitFor(element(by.id('angular-kav-switch')))
      .toExist()
      .withTimeout(10_000);
  });

  it('edits an Angular TextInput and echoes the controlled value', async () => {
    await bringIntoView('angular-greeting-input');
    await element(by.id('angular-greeting-input')).typeText('hi');
    await waitFor(element(by.text('Hello, hi')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders an Angular ImageBackground with children on top', async () => {
    await waitFor(element(by.id('angular-image-bg-label')))
      .toExist()
      .withTimeout(10_000);
  });
});
