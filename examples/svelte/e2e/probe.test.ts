import { by, device, element, waitFor } from 'detox';

// The go/no-go probe: Detox must attach to a symbiote-driven tree at the stock RN host
// `launchApp()` completes the New-Arch startup sync, then a `resp-chip-*` view must survive a tap
// The app boots on the Menu, so the probe opens the Framework hub and pushes into "Canary" first
describe('symbiote attach probe', () => {
  beforeAll(async () => {
    // The `Animated.loop` heartbeat keeps the app from going idle, so sync is off from launch
    // `launchApp` itself waits for idle, which a later `disableSynchronization()` cannot undo
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into the Canary screen through Fabric', async () => {
    // `toExist` alone races the layout pass, `toBeVisible` waits for the row to be hittable
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

  // Attach proof: the renderer drove Fabric and the `testID` reached the native view
  // It checks `toExist`, as the chip sits below the launch fold inside the scroll view
  it('renders a symbiote-driven native view with its testID', async () => {
    await waitFor(element(by.id('resp-chip-0')))
      .toExist()
      .withTimeout(10_000);
  });

  // Recommit proof: a native tap becomes an event and a recommit, and the chip is still there
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
