import { by, device, element, waitFor } from 'detox';

// The Tab navigator on the Angular canary: Menu, Navigation hub, `TabsDemo` with Home, Search and
// Profile, tab switching and `injectIsFocused()` flipping back to true on re-focus

// The tab bar has no `testID`, so `by.text(<tabBarLabel>)` is the only way to tap a tab
// All three labels always paint and no other mounted text matches them
// Each tab prints `focused: {{ isFocused() }}` on one line, so an exact `by.text` is safe

describe('Angular Tab navigator (TabsDemo)', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into TabsDemo, landing on the Home tab', async () => {
    await waitFor(element(by.id('menu-row-NavigationHub')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-NavigationHub')).tap();
    await waitFor(element(by.id('menu-row-TabsDemo')))
      .toBeVisible()
      .whileElement(by.id('hub-scroll-navigation'))
      .scroll(300, 'down', NaN, 0.8);
    await element(by.id('menu-row-TabsDemo')).tap();
    // `initialRouteName="Home"`, so this also proves the Tab mounted on the right screen
    await waitFor(element(by.text('focused: true')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('switches to the Search tab and shows its content', async () => {
    await waitFor(element(by.text('Search')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.text('Search')).tap();
    await waitFor(element(by.text('Search tab')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('switches to the Profile tab and shows its content', async () => {
    await waitFor(element(by.text('Profile')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.text('Profile')).tap();
    await waitFor(element(by.text('Profile tab')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('switches back to the Home tab and re-focuses it', async () => {
    await waitFor(element(by.text('Home')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.text('Home')).tap();
    // Only the focused route mounts, so Home is recreated and `injectIsFocused()` starts over
    await waitFor(element(by.text('focused: true')))
      .toBeVisible()
      .withTimeout(10_000);
  });
});
