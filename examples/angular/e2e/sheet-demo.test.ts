import { by, device, element, waitFor } from 'detox';

// Present and dismiss round trip for `SheetDemoScreen`, opened from the Navigation hub
// A sheet is the same route pushed again as a `formSheet`, so `sheet-dismiss` is both the
// landing signal that the sheet rendered and the dismiss action

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// `tap()` and `toBeVisible()` break across the presented view controller boundary
// `frame` stays in screen coordinates, so tap its centre with a raw device tap
async function deviceTap(id: string): Promise<void> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) {
    throw new Error(`${id}: getAttributes() returned no frame`);
  }
  const { x, y, width, height } = attrs.frame;
  await device.tap({ x: x + width / 2, y: y + height / 2 });
}

// The sheet transition moves `sheet-dismiss` into place, settled means two equal reads in a row
async function waitForFrameSettle(
  id: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const poll = async (
    lastX: number,
    lastY: number,
    stableReads: number,
  ): Promise<void> => {
    if (Date.now() >= deadline) {
      throw new Error(`${id}'s frame never settled within ${timeoutMs}ms`);
    }
    await sleep(150);
    const attrs = await element(by.id(id)).getAttributes();
    if (!('frame' in attrs)) return poll(lastX, lastY, 0);
    const { x: currentX, y: currentY } = attrs.frame;
    const isStill =
      Math.abs(currentX - lastX) < 1 && Math.abs(currentY - lastY) < 1;
    const stable = isStill ? stableReads + 1 : 0;
    if (stable >= 2) return;
    return poll(currentX, currentY, stable);
  };
  return poll(Number.NaN, Number.NaN, 0);
}

describe('Angular sheet presentation demo', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('opens SheetDemo from the Navigation hub', async () => {
    await waitFor(element(by.id('menu-row-NavigationHub')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-NavigationHub')).tap();
    await waitFor(element(by.id('menu-row-SheetDemo')))
      .toBeVisible()
      .whileElement(by.id('hub-scroll-navigation'))
      .scroll(300, 'down', NaN, 0.8);
    await element(by.id('menu-row-SheetDemo')).tap();
    await waitFor(element(by.id('sheet-present')))
      .toBeVisible()
      .whileElement(by.id('sheet-scroll'))
      .scroll(300, 'down', NaN, 0.8);
  });

  it('presents the sheet and renders its content as a formSheet', async () => {
    await deviceTap('sheet-present');
    // `toExist` confirms the push landed, the content sizing pass after the transition is slower
    await waitFor(element(by.id('sheet-dismiss')))
      .toExist()
      .withTimeout(10_000);
    await waitForFrameSettle('sheet-dismiss', 20_000);
  });

  it('dismisses the sheet via its own Dismiss button and returns to the panel', async () => {
    await deviceTap('sheet-dismiss');
    await waitFor(element(by.id('sheet-present')))
      .toExist()
      .withTimeout(10_000);
  });

  // SKIPPED: the grabber is native sheet chrome with no `testID`, no matcher can reach it
  // Re-enable only if a revision exposes a JS-drivable detent handle
  it.skip('drags the sheet grabber between detents', async () => {});
});
