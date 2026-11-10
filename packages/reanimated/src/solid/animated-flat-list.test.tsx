import { createLiveTree } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/solid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutAnimationType } from 'react-native-reanimated/src/commonTypes';
import { updateLayoutAnimations } from 'react-native-reanimated/src/UpdateLayoutAnimations';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { AnimatedFlatList } from './animated-flat-list';
import '../register';

vi.mock('react-native-reanimated/src/UpdateLayoutAnimations', () => ({
  updateLayoutAnimations: vi.fn(),
}));

type IRow = { id: string };
type IProps = Partial<Parameters<typeof AnimatedFlatList<IRow>>[0]>;

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 16_951;
const ROWS = 2;
const DATA: IRow[] = [{ id: 'a' }, { id: 'b' }];
const update = vi.mocked(updateLayoutAnimations);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  update.mockClear();
  host.fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });

async function scrollerOf(props: IProps) {
  mount(ROOT_TAG, () => (
    <AnimatedFlatList<IRow>
      data={DATA}
      keyExtractor={item => item.id}
      renderItem={() => <view entering={fade} />}
      {...props}
    />
  ));
  await tick();
  const [found] = host.fabric.findAll(
    node => node.viewName === 'RCTScrollView',
  );
  if (found === undefined) throw new Error('the list did not mount');
  return live.nodeOf(found.handle);
}

function enteringCancelled(): boolean {
  return update.mock.calls.some(([, type, config]) => {
    return type === LayoutAnimationType.ENTERING && config === undefined;
  });
}

describe('Animated.FlatList', () => {
  it('asks its scroll view for an event every frame, as the author expects', async () => {
    const scroller = await scrollerOf({});

    expect(scroller.payload.scrollEventThrottle).toBe(1);
  });

  it('leaves the scroll event throttle the author chose alone', async () => {
    const scroller = await scrollerOf({ scrollEventThrottle: 16 });

    expect(scroller.payload.scrollEventThrottle).toBe(16);
  });

  it('lets the rows animate in when the author does not say otherwise', async () => {
    await scrollerOf({});

    expect(enteringCancelled()).toBe(false);
  });

  it('skips the entering animation of the rows it mounts with when asked to', async () => {
    await scrollerOf({ skipEnteringExitingAnimations: true });

    expect(enteringCancelled()).toBe(true);
  });
});

describe('Animated.FlatList rows', () => {
  const slide = { build: () => fade };

  function layoutConfigured(): boolean {
    return update.mock.calls.some(([, type, config]) => {
      return type === LayoutAnimationType.LAYOUT && config === fade;
    });
  }

  it('gives every row the layout animation of the list', async () => {
    await scrollerOf({ itemLayoutAnimation: slide });

    expect(
      update.mock.calls.filter(
        ([, type]) => type === LayoutAnimationType.LAYOUT,
      ),
    ).toHaveLength(ROWS);
    expect(layoutConfigured()).toBe(true);
  });

  it('gives the rows no layout animation unless the author names one', async () => {
    await scrollerOf({});

    expect(layoutConfigured()).toBe(false);
  });

  it('styles every row with the style object the author passes', async () => {
    const scroller = await scrollerOf({
      CellRendererComponentStyle: { opacity: 0.5 },
    });
    const rows = live.findAllLive(
      scroller.handle,
      node => node.payload.opacity === 0.5,
    );

    expect(rows).toHaveLength(ROWS);
  });

  it('asks the style function for the item and the index of each row', async () => {
    const asked: Array<{ id: string; index: number }> = [];
    await scrollerOf({
      CellRendererComponentStyle: ({ item, index }) => {
        asked.push({ id: String(Reflect.get(Object(item), 'id')), index });
        return { opacity: 1 };
      },
    });

    expect(asked).toEqual([
      { id: 'a', index: 0 },
      { id: 'b', index: 1 },
    ]);
  });
});
