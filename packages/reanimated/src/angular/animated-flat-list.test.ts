import '@angular/compiler';
import { CUSTOM_ELEMENTS_SCHEMA, Component } from '@angular/core';
import { createLiveTree } from '@symbiote-native/test-utils';
import { VListItemDirective, mount, unmount } from '@symbiote-native/angular';
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

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 16_971;
const ROWS = 2;
const update = vi.mocked(updateLayoutAnimations);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
let hostCount = 0;

beforeEach(() => {
  update.mockClear();
  host.fabric.reset();
});
afterEach(() => unmount(ROOT_TAG));

const fade = () => ({ animations: {}, initialValues: {}, callback: undefined });

// The inputs of the list under test, set on a host that binds each of them
function hostWith(inputs: object) {
  hostCount += 1;
  @Component({
    selector: `flat-list-host-${hostCount}`,
    standalone: true,
    imports: [AnimatedFlatList, VListItemDirective],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
    template: `<AnimatedFlatList
      [data]="data"
      [keyExtractor]="keyExtractor"
      [scrollEventThrottle]="scrollEventThrottle"
      [itemLayoutAnimation]="itemLayoutAnimation"
      [skipEnteringExitingAnimations]="skipEnteringExitingAnimations"
      [cellRendererComponentStyle]="cellRendererComponentStyle"
    >
      <ng-template vListItem><view [entering]="fade"></view></ng-template>
    </AnimatedFlatList>`,
  })
  class Host {
    readonly fade = fade;
    data: IRow[] = [{ id: 'a' }, { id: 'b' }];
    keyExtractor = (item: IRow) => item.id;
    scrollEventThrottle = undefined;
    itemLayoutAnimation = undefined;
    skipEnteringExitingAnimations = undefined;
    cellRendererComponentStyle = undefined;
    constructor() {
      Object.assign(this, inputs);
    }
  }
  return Host;
}

async function scrollerOf(inputs: object) {
  mount(ROOT_TAG, hostWith(inputs));
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
      cellRendererComponentStyle: { opacity: 0.5 },
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
      cellRendererComponentStyle: ({
        item,
        index,
      }: {
        item: IRow;
        index: number;
      }) => {
        asked.push({ id: item.id, index });
        return { opacity: 1 };
      },
    });

    expect(asked).toEqual([
      { id: 'a', index: 0 },
      { id: 'b', index: 1 },
    ]);
  });
});
