import { act, createElement } from 'react';
import { mount, unmount } from '@symbiote-native/react';
import {
  isSymbioteNode,
  listenerFor,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { createLiveTree } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubCancelAnimationFrame } from '../../test-support/cancel-animation-frame';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { settle } from '../../test-support/worklet';
import { ReanimatedScreen } from '../../../../examples/react/screens/ReanimatedScreen';
import '../register';

// The screen examples/react shows, mounted over the package as an app would: whatever throws on
// a device at render time throws here first
// A touch inside a scroll view asks the keyboard module, which needs the native event hub
Object.assign(globalThis, { RN$registerCallableModule: (): void => {} });
const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 17_001;
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
];

const SECTION_TITLES = [
  'Animations',
  'Derived values and animated props',
  'Entering and exiting',
  'Layout transitions',
  'Transform origin',
  'Scroll',
  'Frames and sensors',
  'CSS',
  'Worklets',
  'Shared state',
  'Shared element transition',
  'Measure and refs',
  'Parity with Reanimated 4.7.1',
];

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

beforeEach(() => {
  stubCancelAnimationFrame();
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => unmount(ROOT_TAG));
  vi.useRealTimers();
});

async function mountScreen(): Promise<ISymbioteNode> {
  let root: ISymbioteNode | null = null;
  act(() =>
    mount(
      ROOT_TAG,
      createElement(
        'view',
        {
          ref: (instance: ISymbioteNode | null) => {
            root = instance ?? root;
          },
        },
        createElement(ReanimatedScreen),
      ),
    ),
  );
  await settle();
  if (root === null) throw new Error('the screen did not mount');
  return root;
}

// A pressable listens for the termination request, so that is what marks a button among the
// nodes that carry a test id
function buttonHandles(): Map<string, ISymbioteNode> {
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

function tap(handle: ISymbioteNode): void {
  host.fabric.fireEvent(handle, TOUCH_START);
  host.fabric.fireEvent(handle, TOUCH_END);
}

async function press(testID: string): Promise<void> {
  const handle = buttonHandles().get(testID);
  if (handle === undefined)
    throw new Error(`no button ${testID} on the screen`);
  act(() => tap(handle));
  await settle();
}

describe('the Reanimated demo screen', () => {
  it('shows a section for each part of the Reanimated surface', async () => {
    const root = await mountScreen();

    const texts = live.texts(root);

    expect(SECTION_TITLES.filter(title => !texts.includes(title))).toEqual([]);
  });

  it('has the buttons of every section to press', async () => {
    await mountScreen();

    expect(buttonHandles().size).toBeGreaterThan(MIN_BUTTONS);
  });

  it('survives a press on every button it has, but the native-only ones', async () => {
    const root = await mountScreen();
    const handles = [...buttonHandles()]
      .filter(([testID]) => !NATIVE_ONLY.includes(testID))
      .map(([, handle]) => handle);

    act(() => handles.forEach(tap));
    await settle();

    expect(live.texts(root)).toContain('Reanimated');
  });

  it('plays an animation and says which one', async () => {
    const root = await mountScreen();

    await press('ra-play-timing');

    expect(live.texts(root)).toContain('last: timing');
  });

  it('moves on to the next entering preset', async () => {
    const root = await mountScreen();

    await press('ra-preset-next');

    expect(live.texts(root)).toContain('preset: Slide');
  });

  it('turns the box around the corner that was picked and says which', async () => {
    const root = await mountScreen();

    await press('ra-origin-top-left');

    expect(live.texts(root)).toContain('origin: top left');
  });

  // Both live at module level, so earlier tests of this file may already have counted on them
  function countOf(root: ISymbioteNode, label: string): number {
    const line = live.texts(root).find(text => text.startsWith(`${label}: `));
    return Number(line?.slice(label.length + 2));
  }

  it('counts on a mutable made outside any component', async () => {
    const root = await mountScreen();
    const before = countOf(root, 'mutable');

    await press('ra-shared-mutable');
    await press('ra-shared-mutable');

    expect(countOf(root, 'mutable')).toBe(before + 2);
  });

  it('counts on a synchronizable read back on the JS thread', async () => {
    const root = await mountScreen();
    const before = countOf(root, 'synchronizable');

    await press('ra-shared-sync');

    expect(countOf(root, 'synchronizable')).toBe(before + 1);
  });

  it('reaches the entry-exit transition after the others', async () => {
    const root = await mountScreen();

    // Each press reads the transition the one before it set, so they cannot run together
    await press('ra-layout-next');
    await press('ra-layout-next');
    await press('ra-layout-next');
    await press('ra-layout-next');
    await press('ra-layout-next');

    expect(live.texts(root)).toContain('transition: EntryExit');
  });

  it('moves the shared element to the second fake screen and back', async () => {
    const root = await mountScreen();
    const boundaries = () =>
      host.fabric.findAll(
        node => node.viewName === 'REASharedTransitionBoundary',
      ).length;
    const before = boundaries();

    await press('ra-shared-toggle');

    expect(live.texts(root)).toContain('showing: second');
    expect(boundaries()).toBe(before + 1);

    await press('ra-shared-toggle');

    expect(live.texts(root)).toContain('showing: first');
  });

  it('moves the first row to the end when shuffled, with no row added before', async () => {
    const root = await mountScreen();
    // The layout section comes before the scroll section, which has rows of its own
    const rowsOf = () =>
      live
        .texts(root)
        .filter(text => /^row \d+$/.test(text))
        .slice(0, 4);

    await press('ra-layout-shuffle');

    expect(rowsOf()).toEqual(['row 1', 'row 2', 'row 3', 'row 0']);
  });

  it('adds a row to the list that reflows', async () => {
    const root = await mountScreen();

    await press('ra-layout-add');

    expect(live.texts(root)).toContain('row 4');
  });

  it('adds a row to the Animated.FlatList', async () => {
    const root = await mountScreen();

    await press('ra-list-add');

    expect(live.texts(root)).toContain('item 3');
  });

  it('counts the transitions of the bar, none before one has ended', async () => {
    const root = await mountScreen();

    await press('ra-css-toggle');

    expect(live.texts(root)).toContain('transitions ended: 0');
  });
});
