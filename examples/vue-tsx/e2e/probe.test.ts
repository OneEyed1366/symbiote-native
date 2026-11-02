import { by, device, element, waitFor } from 'detox';

// The go/no-go probe: Detox must attach to a symbiote-driven tree at the stock RN host
// `launchApp()` completes the New-Arch startup sync (the #4506 bridgeless-deadlock gate)
// Then a native view with the canary's `resp-chip-${index}` testID is visible and survives a tap

// The app boots on the Menu, so the probe pushes into "Canary" through the Framework hub first
describe('symbiote attach probe', () => {
  beforeAll(async () => {
    // The `Animated.loop` heartbeat never idles, so sync is off from the first launch
    // A later `disableSynchronization()` is too late, and this probe checks attach, not quiescence
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into the Canary screen through Fabric', async () => {
    // `toExist` alone races the layout pass of the Menu, `toBeVisible` waits for the row to settle
    await waitFor(element(by.id('menu-row-FrameworkHub')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-FrameworkHub')).tap();
    await waitFor(element(by.id('menu-row-Canary')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-Canary')).tap();
    await waitFor(element(by.id('canary-scroll')))
      .toExist()
      .withTimeout(10_000);
  });

  // The renderer drove `nativeFabricUIManager` and carried the `testID` through to Fabric
  // `toExist`, not `toBeVisible`: the chip sits below the launch fold
  it('renders a symbiote-driven native view with its testID', async () => {
    await waitFor(element(by.id('resp-chip-0')))
      .toExist()
      .withTimeout(10_000);
  });

  // Scroll the chip on screen and tap it, the tree must survive the event driven recommit
  it('survives a symbiote recommit from a native tap', async () => {
    await waitFor(element(by.id('resp-chip-0')))
      .toBeVisible()
      .whileElement(by.id('canary-scroll'))
      .scroll(240, 'down');
    await element(by.id('resp-chip-0')).tap();
    await waitFor(element(by.id('resp-chip-0')))
      .toBeVisible()
      .withTimeout(10_000);
  });
});
