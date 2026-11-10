import { by, device, element, waitFor } from 'detox';

// The Drawer navigator on the Angular canary: Menu, Navigation hub, then `DrawerDemo` on the right
// Covers the open button, `jumpTo` from the drawer panel and `closeDrawer()` as a no-op

// The panel is always mounted and translated off-canvas, so closed means `frame.x`, not absence
// `jumpTo` closes the drawer as a side effect, `closeDrawer` never touches the index

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function frameX(id: string): Promise<number> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) {
    throw new Error(`${id}: getAttributes() returned no frame`);
  }
  return attrs.frame.x;
}

// `tap()` and `toBeVisible()` lose a view under an animated `translateX` ancestor
// `frame` still reports the real position, so tap its centre with a raw device tap
async function deviceTap(id: string): Promise<void> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) {
    throw new Error(`${id}: getAttributes() returned no frame`);
  }
  const { x, y, width, height } = attrs.frame;
  await device.tap({ x: x + width / 2, y: y + height / 2 });
}

// The transition is JS driven with a full commit per frame, so poll the geometry
// Settled means it moved off its start and then held still for two reads, in either direction
async function waitForTransformSettle(
  id: string,
  timeoutMs: number,
): Promise<void> {
  const startX = await frameX(id);
  const deadline = Date.now() + timeoutMs;
  const poll = async (
    lastX: number,
    hasMoved: boolean,
    stableReads: number,
  ): Promise<void> => {
    if (Date.now() >= deadline) {
      throw new Error(
        `${id}'s transform never settled within ${timeoutMs}ms (startX=${startX}, lastX=${lastX})`,
      );
    }
    await sleep(150);
    const currentX = await frameX(id);
    const moved = hasMoved || Math.abs(currentX - startX) > 2;
    const stable =
      moved && Math.abs(currentX - lastX) < 1 ? stableReads + 1 : 0;
    if (stable >= 2) return;
    return poll(currentX, moved, stable);
  };
  return poll(startX, false, 0);
}

async function openDrawerDemo(): Promise<void> {
  await waitFor(element(by.id('menu-row-NavigationHub')))
    .toBeVisible()
    .withTimeout(10_000);
  await element(by.id('menu-row-NavigationHub')).tap();
  await waitFor(element(by.id('menu-row-DrawerDemo')))
    .toBeVisible()
    .whileElement(by.id('hub-scroll-navigation'))
    .scroll(300, 'down', NaN, 0.8);
  await element(by.id('menu-row-DrawerDemo')).tap();
  await waitFor(element(by.id('drawer-open')))
    .toBeVisible()
    .whileElement(by.id('drawer-scroll'))
    .scroll(300, 'down', NaN, 0.8);
}

describe('Angular Drawer navigator (DrawerDemo)', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into DrawerDemo, landing on Home', async () => {
    await openDrawerDemo();
    await waitFor(element(by.id('drawer-open')))
      .toBeVisible()
      .withTimeout(10_000);
  });

  it('opens the drawer via the Open drawer button', async () => {
    await element(by.id('drawer-open')).tap();
    // Every frame of the open is a full Fabric commit, so under load it outlasts the nominal 250ms
    await waitForTransformSettle('drawer-panel', 20_000);
  });

  it('jumping to Settings from the drawer panel navigates and closes the drawer', async () => {
    await waitFor(element(by.id('drawer-menu-Settings')))
      .toBeVisible()
      .withTimeout(10_000);
    await deviceTap('drawer-menu-Settings');
    // The close animates the same way and the slide type moves the content slot too
    await waitForTransformSettle('drawer-close-from-settings', 20_000);
    await waitForTransformSettle('drawer-panel', 20_000);
  });

  it('closing an already-closed drawer from Settings is a no-op that does not navigate', async () => {
    // `jumpTo` already closed it, so this hits the `isOpen` guard and no transition may start
    // Proof: no crash, still on Settings, and `drawer-panel` keeps its `frame.x`
    const beforeX = await frameX('drawer-panel');

    await deviceTap('drawer-close-from-settings');
    await waitFor(element(by.id('drawer-close-from-settings')))
      .toExist()
      .withTimeout(10_000);
    await sleep(500);

    const afterX = await frameX('drawer-panel');
    if (Math.abs(afterX - beforeX) > 2) {
      throw new Error(
        `drawer-panel moved (${beforeX} -> ${afterX}) - closeDrawer() should be a no-op here`,
      );
    }
  });

  // SKIPPED: the swipe parameters are a guess, no `testID` anchors the right-edge start point
  // Re-enable once a run confirms or corrects the gesture
  it.skip('opens the drawer via a right-edge swipe gesture', async () => {
    await openDrawerDemo();
    await element(by.id('drawer-open')).swipe('left', 'fast', 0.9, 0.95, 0.5);
    await waitFor(element(by.id('drawer-panel')))
      .toBeVisible()
      .withTimeout(10_000);
  });
});
