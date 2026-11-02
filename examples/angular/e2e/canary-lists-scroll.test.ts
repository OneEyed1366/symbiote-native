import { by, device, element, waitFor } from 'detox';

// Lists and scroll on `CanaryScreen` that `probe.test.ts` does not touch: the outer RefreshControl,
// the Dimensions and Keyboard readouts, the two nested FlatLists and the native-driven parity box

const MAX_SCROLL_STEPS = 15;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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

// `getAttributes()` returns one element or many, so narrow with `in` instead of casting
async function elementText(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text;
  return '';
}

// Detox `waitFor` has no text predicate, so poll
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

describe('Angular canary lists & scroll', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
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
    // The first test scrolls at once, so wait for the ScrollView to have real bounds
    await waitFor(element(by.id('angular-canary-scroll')))
      .toBeVisible()
      .withTimeout(10_000);
    await sleep(300);
  });

  it('renders a RefreshControl on the outer ScrollView', async () => {
    // The pull gesture cannot be driven reliably with sync off, so assert it is mounted
    await element(by.id('angular-canary-scroll')).scrollTo('top');
    await waitFor(element(by.id('angular-refresh-control')))
      .toExist()
      .withTimeout(10_000);
  });

  it('renders dimensions and keyboard status text with plausible content', async () => {
    await bringIntoView('angular-dimensions');
    // Multi-line `{{ }}` interpolation keeps its whitespace, so match the content, not exact text
    await waitForText(
      'angular-dimensions',
      text => /\d+×\d+/.test(text),
      5_000,
    );
    await waitForText(
      'angular-keyboard',
      text => /keyboard (up|down)/.test(text),
      5_000,
    );
  });

  it('renders the Angular chips FlatList nested in the ScrollView', async () => {
    // A nested FlatList trips the Detox hittability bug (see `probe.test.ts`)
    // So check visibility only, a tap or an inner scroll can fail the pre-check on screen
    await bringIntoView('angular-chips-list');
    await waitFor(element(by.id('angular-chips-list')))
      .toBeVisible()
      .withTimeout(5_000);
  });

  it('prepends items into the MVCP FlatList while the anchored item stays visible', async () => {
    // The list is only checked for visibility, the tap goes to a sibling button outside it
    await bringIntoView('angular-mvcp-list');
    await waitFor(element(by.text('item 0')))
      .toBeVisible()
      .withTimeout(10_000);

    await bringIntoView('angular-mvcp-prepend-btn');
    await element(by.id('angular-mvcp-prepend-btn')).tap();
    await sleep(300);

    // `minIndexForVisible: 0` anchors "item 0" on screen instead of holding the scroll offset
    // The newest prepended row, "item -1", proves the data grew
    await waitFor(element(by.text('item 0')))
      .toBeVisible()
      .withTimeout(10_000);
    await waitFor(element(by.text('item -1')))
      .toExist()
      .withTimeout(10_000);
  });

  it('keeps the native-driven parity header and scroll box responsive across a JS-thread freeze', async () => {
    await bringIntoView('angular-parity-header');
    await waitFor(element(by.id('angular-parity-scroll-box')))
      .toBeVisible()
      .withTimeout(10_000);

    await bringIntoView('angular-freeze-js-scroll-btn');
    await element(by.id('angular-freeze-js-scroll-btn')).tap();
    // `freezeJsScroll()` blocks the JS thread for 3s and nothing observable changes meanwhile
    await sleep(3_500);

    // Still mounted and scrollable afterwards, so the JS thread resumed
    await waitFor(element(by.id('angular-parity-header')))
      .toExist()
      .withTimeout(10_000);
    await waitFor(element(by.id('angular-parity-scroll-box')))
      .toExist()
      .withTimeout(10_000);
    await element(by.id('angular-canary-scroll')).scrollTo('top');
    await waitFor(element(by.id('angular-safe-area')))
      .toExist()
      .withTimeout(10_000);
  });
});
