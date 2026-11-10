// The exit of a tile through Reanimated's own layout animations proxy, compiled from the installed
// package and set between the real shadow tree and the stub platform, as a device has it
// The animation itself is the test's own frames: the proxy is what is under test, not the worklets
import {
  appendChild,
  createElement,
  createSurface,
  getNativeTag,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  afterEach,
  beforeEach,
  configureEntering,
  configureExiting,
  describe,
  endLayoutAnimation,
  expect,
  it,
  mounted,
  mountingLogs,
  print,
  progressLayoutAnimation,
  report,
  useLayoutAnimationsProxy,
  type IMountedView,
} from './harness';

const ROOT_TAG = 1;
const surface = createSurface(ROOT_TAG);

const TILE = 60;
const EXITING_TYPE = 2;
const ENTERING_TYPE = 1;
const FIRST_NATIVE_ID = 7;

type IStarted = { tag: number; type: number; values: Record<string, number> };

const started: IStarted[] = [];
let section: ISymbioteNode | undefined;

function view(style: Record<string, unknown>, testID?: string): ISymbioteNode {
  const node = createElement('RCTView');
  routeProp(node, 'style', style);
  if (testID !== undefined) routeProp(node, 'testID', testID);
  return node;
}

function button(testID: string): ISymbioteNode {
  const node = view(
    { borderWidth: 2, borderColor: '#6ad48b', padding: 8, opacity: 1 },
    testID,
  );
  routeProp(node, 'collapsable', false);
  return node;
}

function flatten(root: IMountedView): IMountedView[] {
  return [root, ...root.children.flatMap(flatten)];
}

function onScreen(): IMountedView[] {
  return flatten(mounted()).filter(one => one.props.testID !== undefined);
}

const idsOnScreen = () => onScreen().map(one => String(one.props.testID));

function tagOf(node: ISymbioteNode): number {
  const tag = getNativeTag(node);
  if (tag === undefined) throw new Error('the node did not commit');
  return tag;
}

function build() {
  section = view(
    { backgroundColor: '#12263a', padding: 12, gap: 12 },
    'section',
  );
  const stage = view({ minHeight: 70, justifyContent: 'center' });
  const tile = view(
    { width: TILE, height: TILE, backgroundColor: '#6ad48b' },
    'tile',
  );
  const row = view({ flexDirection: 'row', flexWrap: 'wrap', gap: 8 });
  const toggle = button('toggle');
  const next = button('next');
  appendChild(stage, tile);
  appendChild(row, toggle);
  appendChild(row, next);
  appendChild(section, stage);
  appendChild(section, row);
  surface.appendChild(section);
  surface.commit();
  mounted();
  return { stage, tile, toggle, next };
}

beforeEach(() => {
  started.length = 0;
  useLayoutAnimationsProxy(true);
  Reflect.set(globalThis, 'LayoutAnimationsManager', {
    start: (tag: number, type: number, values: Record<string, number>) => {
      started.push({ tag, type, values });
    },
    stop: () => undefined,
  });
});

afterEach(() => {
  if (section !== undefined) surface.removeChild(section);
  section = undefined;
  useLayoutAnimationsProxy(false);
});

describe('an exiting tile under the layout animations proxy', () => {
  it('starts its exit with the size the tile has on screen', () => {
    const { stage, tile } = build();
    configureExiting(tagOf(tile));

    removeChild(stage, tile);
    surface.commit();
    mounted();

    expect(started.length).toBe(1);
    expect(started[0]?.type).toBe(EXITING_TYPE);
    expect(started[0]?.values.currentHeight).toBe(TILE);
  });

  it('keeps the tile on screen while it animates and the buttons with it', () => {
    const { stage, tile } = build();
    configureExiting(tagOf(tile));

    removeChild(stage, tile);
    surface.commit();
    const ids = idsOnScreen();

    expect(ids).toContain('tile');
    expect(ids).toContain('toggle');
    expect(ids).toContain('next');
  });

  it('takes the tile off at the end of its animation and keeps the buttons', () => {
    const { stage, tile } = build();
    const tag = tagOf(tile);
    configureExiting(tag);
    removeChild(stage, tile);
    surface.commit();
    mounted();

    progressLayoutAnimation(tag, { transform: [{ translateY: 30 }] });
    endLayoutAnimation(tag, true);
    surface.commit();
    const ids = idsOnScreen();

    expect(ids).toContain('toggle');
    expect(ids).toContain('next');
    expect(ids.includes('tile')).toBe(false);
  });
});

const frameOf = (one: IMountedView) => [
  one.layout.x,
  one.layout.y,
  one.layout.width,
  one.layout.height,
];

// The paint order: a view later in the host list paints over the ones before it
function paintOrder(): string {
  return flatten(mounted())
    .map(one => String(one.props.testID ?? one.viewName))
    .join(' > ');
}

function framesByTestId(): Record<string, number[]> {
  return Object.fromEntries(
    onScreen().map(one => [String(one.props.testID), frameOf(one)]),
  );
}

describe('where the views stand through an exit', () => {
  it('keeps every button where it was while the tile leaves and after it is gone', () => {
    const { stage, tile } = build();
    const tag = tagOf(tile);
    configureExiting(tag);
    const before = framesByTestId();
    const orderBefore = paintOrder();

    removeChild(stage, tile);
    surface.commit();
    mounted();
    const during = framesByTestId();
    const orderDuring = paintOrder();
    progressLayoutAnimation(tag, { transform: [{ translateY: 60 }] });
    surface.commit();
    mounted();
    const orderFrame = paintOrder();
    endLayoutAnimation(tag, true);
    surface.commit();
    mounted();
    const after = framesByTestId();
    const orderAfter = paintOrder();
    print(
      `ORDER ${[orderBefore, orderDuring, orderFrame, orderAfter].join(' | ')}`,
    );
    print(`FRAMES before ${JSON.stringify(before)}`);
    print(`FRAMES during ${JSON.stringify(during)}`);
    print(`FRAMES after ${JSON.stringify(after)}`);

    expect(orderDuring).toBe(orderBefore);
    expect(orderFrame).toBe(orderBefore);
    expect(orderAfter).toBe(orderBefore.replace(' > tile', ''));
    expect(during.toggle).toEqual(before.toggle);
    expect(during.next).toEqual(before.next);
    expect(during.tile).toEqual(before.tile);
    expect(after.toggle).toEqual(before.toggle);
    expect(after.next).toEqual(before.next);
  });
});

const FLIP_FRAMES = [
  [{ perspective: 500 }, { rotateX: '0deg' }, { translateY: 0 }],
  [{ perspective: 500 }, { rotateX: '-45deg' }, { translateY: 30 }],
  [{ perspective: 500 }, { rotateX: '-90deg' }, { translateY: 60 }],
] as const;

describe('the end of an exit, with no commit after it', () => {
  it('takes the tile off at the next pull, the way a flush request leads to one on a device', () => {
    const { stage, tile } = build();
    const tag = tagOf(tile);
    configureExiting(tag);
    removeChild(stage, tile);
    surface.commit();
    mounted();

    endLayoutAnimation(tag, true);
    const ids = idsOnScreen();

    expect(ids.includes('tile')).toBe(false);
    expect(ids).toContain('toggle');
  });
});

describe('the frames of FlipOutXDown fed to the proxy', () => {
  it('reach the tile and leave every button as it was', () => {
    const { stage, tile } = build();
    const tag = tagOf(tile);
    configureExiting(tag);
    removeChild(stage, tile);
    surface.commit();
    mounted();
    mountingLogs();
    const before = onScreen().map(one => [
      one.props.testID,
      one.props.opacity,
      one.props.transform,
    ]);

    const logsPerFrame = FLIP_FRAMES.map(transform => {
      progressLayoutAnimation(tag, { transform });
      surface.commit();
      mounted();
      return mountingLogs();
    });
    const after = onScreen().map(one => [
      one.props.testID,
      one.props.opacity,
      one.props.transform,
    ]);

    const buttons = (rows: unknown[][]) =>
      rows.filter(row => row[0] === 'toggle' || row[0] === 'next');
    expect(logsPerFrame.map(logs => logs.length)).toEqual([1, 1, 1]);
    expect(logsPerFrame.every(logs => logs[0]?.startsWith('Update '))).toBe(
      true,
    );
    expect(buttons(after)).toEqual(buttons(before));
    expect(String(after.find(row => row[0] === 'tile')?.[2])).toContain(
      '-1.5708rad',
    );
  });
});

function enterTile(stage: ISymbioteNode, nativeId: number) {
  const fresh = view(
    { width: TILE, height: TILE, backgroundColor: '#6ad48b' },
    'entered',
  );
  routeProp(fresh, 'nativeID', String(nativeId));
  configureEntering(nativeId);
  appendChild(stage, fresh);
  surface.commit();
  mounted();
  return { fresh, tag: tagOf(fresh) };
}

describe('a tile that carries both an entering and an exiting animation', () => {
  it('is taken off at the end of its exit once its entering is over and has been pulled', () => {
    const { stage } = build();
    const { fresh, tag } = enterTile(stage, 8);
    endLayoutAnimation(tag, false);
    surface.commit();
    mounted();

    configureExiting(tag);
    removeChild(stage, fresh);
    surface.commit();
    mounted();
    endLayoutAnimation(tag, true);

    expect(idsOnScreen().includes('entered')).toBe(false);
  });

  it('is taken off when the exit starts before the entering was ever pulled as over', () => {
    const { stage } = build();
    const { fresh, tag } = enterTile(stage, 9);
    endLayoutAnimation(tag, false);

    configureExiting(tag);
    removeChild(stage, fresh);
    surface.commit();
    mounted();
    endLayoutAnimation(tag, true);

    expect(idsOnScreen().includes('entered')).toBe(false);
  });

  it('is taken off when the exit starts while the entering still runs, as the JS manager merges them', () => {
    const { stage } = build();
    const { fresh, tag } = enterTile(stage, 10);

    configureExiting(tag);
    removeChild(stage, fresh);
    surface.commit();
    mounted();
    endLayoutAnimation(tag, true);

    expect(idsOnScreen().includes('entered')).toBe(false);
  });
});

describe('a preset change: the old tile leaves while a new one enters, under a button that was pressed', () => {
  it('leaves the buttons on screen, opaque, once both animations are over', () => {
    const { stage, tile, next } = build();
    const oldTag = tagOf(tile);
    configureExiting(oldTag);
    routeProp(next, 'style', {
      borderWidth: 2,
      borderColor: '#bb86fc',
      padding: 8,
      opacity: 0.6,
    });
    surface.commit();
    mounted();
    mountingLogs();

    const fresh = view(
      { width: TILE, height: TILE, backgroundColor: '#bb86fc' },
      'tile2',
    );
    routeProp(fresh, 'nativeID', String(FIRST_NATIVE_ID));
    configureEntering(FIRST_NATIVE_ID);
    removeChild(stage, tile);
    appendChild(stage, fresh);
    routeProp(next, 'style', {
      borderWidth: 2,
      borderColor: '#bb86fc',
      padding: 8,
      opacity: 1,
    });
    surface.commit();
    mounted();
    const orderSwap = paintOrder();
    print(`SWAP ORDER ${orderSwap}`);
    print(`SWAP ${mountingLogs().join(' | ')}`);
    print(`STARTED ${JSON.stringify(started.map(one => [one.type, one.tag]))}`);

    const enteringTag = started.find(one => one.type === ENTERING_TYPE)?.tag;
    progressLayoutAnimation(oldTag, { transform: [{ translateY: 60 }] });
    endLayoutAnimation(oldTag, true);
    if (enteringTag !== undefined) endLayoutAnimation(enteringTag, false);
    surface.commit();
    const views = onScreen();
    const summary = views.map(one =>
      [one.props.testID, one.props.opacity ?? '-'].join(':'),
    );
    print(`END ORDER ${paintOrder()}`);
    print(`END ${summary.join(' ')}`);
    expect(orderSwap.indexOf('section')).toBeLessThan(
      orderSwap.indexOf('toggle'),
    );
    expect(orderSwap.indexOf('toggle')).toBeLessThan(orderSwap.indexOf('next'));
    print(`END LOGS ${mountingLogs().join(' | ')}`);

    const buttons = views.filter(
      one => one.props.testID === 'toggle' || one.props.testID === 'next',
    );
    expect(buttons.length).toBe(2);
    expect(
      buttons.every(
        one => one.props.opacity === undefined || one.props.opacity === '1',
      ),
    ).toBe(true);
  });
});

report();
