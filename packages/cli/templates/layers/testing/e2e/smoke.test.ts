import { device, element, by, waitFor } from 'detox';

// The go/no-go probe: proves Detox attaches to a symbiote-driven tree at the stock RN host and
// that the renderer actually painted native views (not a blank screen). The welcome text is
// present on first launch whether or not the navigation layer is scaffolded — the nav layer's
// Menu screen renders the same line.
describe('symbiote attach probe', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  it('renders the app through Fabric', async () => {
    await waitFor(element(by.text('Welcome to SymbioteNative!')))
      .toBeVisible()
      .withTimeout(10_000);
  });
});
