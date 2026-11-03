import { by, device, element, waitFor } from 'detox';

// `StatePersistenceScreen`, opened from the Navigation hub: Serialize writes the live root-Stack
// state out as JSON and Restore parses it back and calls `reset()`, which really navigates

// Restoring the snapshot just captured resets the Stack to the state it already has
// So re-serializing afterwards must give byte-identical JSON, and that is the only restore driven
// An edited snapshot would navigate to whatever it encodes, which needs a guess to assert

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// The Detox hittability pre-check misfires for `ActionButton` targets such as `persist-serialize`
// A composed component sits behind an anchor host node, so tap the centre of its frame instead
async function deviceTap(id: string): Promise<void> {
  const attrs = await element(by.id(id)).getAttributes();
  if (!('frame' in attrs)) {
    throw new Error(`${id}: getAttributes() returned no frame`);
  }
  const { x, y, width, height } = attrs.frame;
  await device.tap({ x: x + width / 2, y: y + height / 2 });
}

async function elementText(id: string): Promise<string> {
  const attrs = await element(by.id(id)).getAttributes();
  if ('text' in attrs && typeof attrs.text === 'string') return attrs.text;
  return '';
}

// Detox `waitFor` has no text predicate, and each change follows a press and a recommit
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

const snapshotPlaceholder =
  'tap Serialize to capture the current route stack as JSON';

describe('Angular State persistence demo', () => {
  beforeAll(async () => {
    await device.launchApp({
      newInstance: true,
      launchArgs: { detoxEnableSynchronization: 0 },
    });
  });

  it('navigates from the menu into the StatePersistence screen', async () => {
    await waitFor(element(by.id('menu-row-NavigationHub')))
      .toBeVisible()
      .withTimeout(10_000);
    await element(by.id('menu-row-NavigationHub')).tap();
    await waitFor(element(by.id('menu-row-StatePersistence')))
      .toBeVisible()
      .whileElement(by.id('hub-scroll-navigation'))
      .scroll(300, 'down', NaN, 0.8);
    await element(by.id('menu-row-StatePersistence')).tap();
    await waitFor(element(by.id('persist-snapshot')))
      .toBeVisible()
      .whileElement(by.id('persist-scroll'))
      .scroll(300, 'down', NaN, 0.8);
  });

  it('shows the placeholder before anything has been serialized', async () => {
    // An empty input reports its value, so the placeholder text may read back as empty
    await waitForText(
      'persist-snapshot',
      text => text === '' || text === snapshotPlaceholder,
      5_000,
    );
  });

  it('serializes the live root-Stack state into real JSON on Serialize', async () => {
    await deviceTap('persist-serialize');
    await waitForText(
      'persist-snapshot',
      text => text.includes('"routes"') && text.includes('"StatePersistence"'),
      5_000,
    );
  });

  it('round-trips the just-captured snapshot through Restore with no error, staying on this screen', async () => {
    const snapshotBeforeRestore = await elementText('persist-snapshot');

    await deviceTap('persist-restore');
    // Wait out the reset and recommit, then check the screen is still here with `toExist`
    // `toBeVisible` is unreliable for an `ActionButton` target, existence proves no navigation away
    await sleep(500);
    await waitFor(element(by.id('persist-serialize')))
      .toExist()
      .withTimeout(5_000);

    // `reset` keeps the route keys verbatim, so re-serializing must match the earlier snapshot
    await deviceTap('persist-serialize');
    await waitForText(
      'persist-snapshot',
      text => text === snapshotBeforeRestore,
      5_000,
    );
  });
});
