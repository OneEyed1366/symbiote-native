import { by, device, element, waitFor } from 'detox';

// `HooksDemoScreen`, reached from the Navigation hub: it only displays what `injectIsFocused`,
// `injectFocusEffect` and `injectNavigationState` read, so the check is live state on first mount

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Multi-line `{{ }}` interpolation keeps its whitespace, so match by content, not exact text
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

describe('Angular Hooks demo', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into the HooksDemo screen', async () => {
    await waitFor(element(by.id('menu-row-NavigationHub')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-NavigationHub')).tap();
    // The row sits below the fold, so scroll the hub until it is hittable
    await waitFor(element(by.id('menu-row-HooksDemo')))
      .toBeVisible()
      .whileElement(by.id('hub-scroll-navigation'))
      .scroll(300, 'down', NaN, 0.8);
    await element(by.id('menu-row-HooksDemo')).tap();
    await waitFor(element(by.id('hooks-is-focused')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('reports focused on first mount via injectIsFocused', async () => {
    await waitForText(
      'hooks-is-focused',
      text => text.includes('injectIsFocused(): true'),
      5_000,
    );
  });

  it('counts the first mount as focus #1 via injectFocusEffect', async () => {
    await waitForText(
      'hooks-focus-count',
      text => text.includes('injectFocusEffect ran: 1'),
      5_000,
    );
  });

  it('renders the live root-Stack route stack via injectNavigationState', async () => {
    await waitFor(element(by.text('0. Menu')))
      .toExist()
      .withTimeout(10_000);
    await waitFor(element(by.text('2. HooksDemo')))
      .toExist()
      .withTimeout(10_000);
  });

  // SKIPPED: a focus, blur, focus cycle needs the native back chevron, which has no `testID`
  // A guessed matcher cannot be checked headless and would rot silently
  // Re-enable once a stable back-button `testID` exists or a matcher is confirmed on a device
  it.skip('increments the focus count across a focus->blur->focus cycle', async () => {
    await element(by.id('menu-row-HooksDemo')).tap();
    await waitForText(
      'hooks-focus-count',
      text => text.includes('injectFocusEffect ran: 2'),
      5_000,
    );
  });
});
