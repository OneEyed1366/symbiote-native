import {
  isSymbioteNode,
  listenerFor,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import type { createLiveTree } from '@symbiote-native/test-utils';
import { describe, expect, it } from 'vitest';
import type { installWrapperHost } from './wrapper-host';

// The screens of the six example apps are the same screen, so one suite holds each of them to it
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const TERMINATION_REQUEST = 'responderTerminationRequest';
const MIN_BUTTONS = 20;
// Headless, Vite resolves the web file of these platform functions, which wants a DOM element;
// a device runs the `.native` one
const NATIVE_ONLY = [
  'ra-scroll-top',
  'ra-measure-run',
  'ra-measure-write',
  'ra-measure-focus',
  'ra-shared-read',
] as const;

type INativeOnly = (typeof NATIVE_ONLY)[number];

export const SECTION_TITLES = [
  'Animations',
  'Derived values and animated props',
  'Entering and exiting',
  'Layout transitions',
  'Transform origin',
  'Scroll',
  'Animated.FlatList',
  'Frames and sensors',
  'CSS',
  'Worklets',
  'Shared state',
  'Shared element transition',
  'Measure and refs',
  'Parity with Reanimated 4.7.1',
] as const;

type ISectionTitle = (typeof SECTION_TITLES)[number];

const isNativeOnly = (testID: string): testID is INativeOnly =>
  NATIVE_ONLY.some(name => name === testID);

type IDemoScreen = {
  host: ReturnType<typeof installWrapperHost>;
  live: ReturnType<typeof createLiveTree>;
  // Mounts the screen and hands back the root it rendered into
  mountScreen: () => Promise<ISymbioteNode>;
  // Lets what a press set going come to rest
  flush: () => Promise<void>;
};

// A pressable listens for the termination request, so that is what marks a button among the
// nodes that carry a test id
function buttonHandles({ host }: IDemoScreen): Map<string, ISymbioteNode> {
  const buttons = new Map<string, ISymbioteNode>();
  for (const node of host.fabric.findAll(
    one => typeof one.props.testID === 'string',
  )) {
    const { instanceHandle } = node;
    if (
      isSymbioteNode(instanceHandle) &&
      listenerFor(instanceHandle, TERMINATION_REQUEST) !== undefined
    ) {
      buttons.set(String(node.props.testID), instanceHandle);
    }
  }
  return buttons;
}

function tap({ host }: IDemoScreen, handle: ISymbioteNode): void {
  host.fabric.fireEvent(handle, TOUCH_START);
  host.fabric.fireEvent(handle, TOUCH_END);
}

async function press(screen: IDemoScreen, testID: string): Promise<void> {
  const handle = buttonHandles(screen).get(testID);
  if (handle === undefined)
    throw new Error(`no button ${testID} on the screen`);
  tap(screen, handle);
  await screen.flush();
}

// Each press reads what the one before it set, so they cannot run together
async function pressTimes(
  screen: IDemoScreen,
  testID: string,
  times: number,
): Promise<void> {
  if (times === 0) return;
  await press(screen, testID);
  await pressTimes(screen, testID, times - 1);
}

// Both live at module level, so earlier tests of a file may already have counted on them
function countOf(
  { live }: IDemoScreen,
  root: ISymbioteNode,
  name: string,
): number {
  const line = live.texts(root).find(text => text.startsWith(`${name}: `));
  return Number(line?.slice(name.length + 2));
}

function surveyCases(screen: IDemoScreen): void {
  const { live, mountScreen } = screen;

  it('shows a section for each part of the Reanimated surface', async () => {
    const root = await mountScreen();

    const texts = live.texts(root);

    expect(
      SECTION_TITLES.filter((title: ISectionTitle) => !texts.includes(title)),
    ).toEqual([]);
  });

  it('has the buttons of every section to press', async () => {
    await mountScreen();

    expect(buttonHandles(screen).size).toBeGreaterThan(MIN_BUTTONS);
  });

  it('survives a press on every button it has, but the native-only ones', async () => {
    const root = await mountScreen();
    const handles = [...buttonHandles(screen)]
      .filter(([testID]) => !isNativeOnly(testID))
      .map(([, handle]) => handle);

    handles.forEach(handle => tap(screen, handle));
    await screen.flush();

    expect(live.texts(root)).toContain('Reanimated');
  });
}

function playCases(screen: IDemoScreen): void {
  const { live, mountScreen } = screen;

  it('plays an animation and says which one', async () => {
    const root = await mountScreen();

    await press(screen, 'ra-play-timing');

    expect(live.texts(root)).toContain('last: timing');
  });

  it('moves on to the next entering preset', async () => {
    const root = await mountScreen();

    await press(screen, 'ra-preset-next');

    expect(live.texts(root)).toContain('preset: Slide');
  });

  it('turns the box around the corner that was picked and says which', async () => {
    const root = await mountScreen();

    await press(screen, 'ra-origin-top-left');

    expect(live.texts(root)).toContain('origin: top left');
  });
}

function stateCases(screen: IDemoScreen): void {
  const { host, live, mountScreen } = screen;

  it('counts on a mutable made outside any component', async () => {
    const root = await mountScreen();
    const before = countOf(screen, root, 'mutable');

    await press(screen, 'ra-shared-mutable');
    await press(screen, 'ra-shared-mutable');

    expect(countOf(screen, root, 'mutable')).toBe(before + 2);
  });

  it('counts on a synchronizable read back on the JS thread', async () => {
    const root = await mountScreen();
    const before = countOf(screen, root, 'synchronizable');

    await press(screen, 'ra-shared-sync');

    expect(countOf(screen, root, 'synchronizable')).toBe(before + 1);
  });

  it('moves the shared element to the second fake screen and back', async () => {
    const root = await mountScreen();
    const boundaries = () =>
      host.fabric.findAll(
        node => node.viewName === 'REASharedTransitionBoundary',
      ).length;
    const before = boundaries();

    await press(screen, 'ra-shared-toggle');

    expect(live.texts(root)).toContain('showing: second');
    expect(boundaries()).toBe(before + 1);

    await press(screen, 'ra-shared-toggle');

    expect(live.texts(root)).toContain('showing: first');
  });
}

function transitionCases(screen: IDemoScreen): void {
  const { live, mountScreen } = screen;

  it('reaches the entry-exit transition after the others', async () => {
    const root = await mountScreen();

    await pressTimes(screen, 'ra-layout-next', 5);

    expect(live.texts(root)).toContain('transition: EntryExit');
  });

  it('moves the first row to the end when shuffled, with no row added before', async () => {
    const root = await mountScreen();
    // The layout section comes before the scroll section, which has rows of its own
    const rowsOf = () =>
      live
        .texts(root)
        .filter(text => /^row \d+$/.test(text))
        .slice(0, 4);

    await press(screen, 'ra-layout-shuffle');

    expect(rowsOf()).toEqual(['row 1', 'row 2', 'row 3', 'row 0']);
  });

  it('adds a row to the list that reflows', async () => {
    const root = await mountScreen();

    await press(screen, 'ra-layout-add');

    expect(live.texts(root)).toContain('row 4');
  });
}

function listCases(screen: IDemoScreen): void {
  const { live, mountScreen } = screen;

  it('adds a row to the Animated.FlatList', async () => {
    const root = await mountScreen();

    await press(screen, 'ra-list-add');

    expect(live.texts(root)).toContain('item 3');
  });

  it('counts the transitions of the bar, none before one has ended', async () => {
    const root = await mountScreen();

    await press(screen, 'ra-css-toggle');

    expect(live.texts(root)).toContain('transitions ended: 0');
  });
}

export function describeDemoScreen(label: string, screen: IDemoScreen): void {
  describe(`the ${label} Reanimated demo screen`, () => {
    surveyCases(screen);
    playCases(screen);
    stateCases(screen);
    transitionCases(screen);
    listCases(screen);
  });
}
