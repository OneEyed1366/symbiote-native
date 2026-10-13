// The demo screen of an exit animation through the real differ: a section with a stage that holds
// one tile, and a row of buttons under the stage
// Reanimated's layout animations proxy rewrites what the differ hands over when the tile goes
import {
  appendChild,
  createElement,
  createSurface,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  afterEach,
  describe,
  expect,
  it,
  mounted,
  mountingLogs,
  report,
} from './harness';

const ROOT_TAG = 1;
const surface = createSurface(ROOT_TAG);

const TILE = 60;
const STAGE_MIN = 70;
const ROOT = 'parentNativeID: (root)';

function view(style: Record<string, unknown>, testID?: string): ISymbioteNode {
  const node = createElement('RCTView');
  routeProp(node, 'style', style);
  if (testID !== undefined) routeProp(node, 'testID', testID);
  return node;
}

function button(testID: string): ISymbioteNode {
  const node = view(
    { borderWidth: 2, borderColor: '#6ad48b', padding: 8 },
    testID,
  );
  routeProp(node, 'collapsable', false);
  return node;
}

function settle(): string[] {
  surface.commit();
  mounted();
  return mountingLogs();
}

let section: ISymbioteNode | undefined;

// The section paints, the stage and the row of buttons only lay out, as in the demo
function build(nestsChildren = false) {
  section = view(
    { backgroundColor: '#12263a', padding: 12, gap: 12 },
    'section',
  );
  if (nestsChildren) routeProp(section, 'collapsable', false);
  const stage = view({ minHeight: STAGE_MIN, justifyContent: 'center' });
  const tile = view(
    { width: TILE, height: TILE, backgroundColor: '#6ad48b' },
    'tile',
  );
  const row = view({ flexDirection: 'row', flexWrap: 'wrap', gap: 8 });
  appendChild(stage, tile);
  appendChild(row, button('toggle'));
  appendChild(row, button('next'));
  appendChild(section, stage);
  appendChild(section, row);
  surface.appendChild(section);
  return { stage, tile, mount: settle() };
}

afterEach(() => {
  if (section !== undefined) surface.removeChild(section);
  section = undefined;
  settle();
});

const count = (logs: string[], kind: string) =>
  logs.filter(line => line.startsWith(`${kind} `)).length;

describe('the tile of an exit animation and the buttons under its stage', () => {
  it('mount as siblings under the root, as flattening leaves a painted view with no stacking context', () => {
    const { mount } = build();

    const inserts = mount.filter(line => line.startsWith('Insert '));

    expect(count(mount, 'Create')).toBe(4);
    expect(inserts.every(line => line.includes(ROOT))).toBe(true);
    expect(inserts.length).toBe(4);
  });

  it('nest inside the section once the section is a container', () => {
    const { mount } = build(true);

    const insideRoot = mount.filter(
      line => line.startsWith('Insert ') && line.includes(ROOT),
    );

    expect(count(mount, 'Create')).toBe(4);
    expect(count(mount, 'Insert')).toBe(4);
    expect(insideRoot.length).toBe(1);
  });

  it('go with one Remove and one Delete of the tile, and nothing else is removed', () => {
    const { stage, tile } = build();

    removeChild(stage, tile);
    const logs = settle();

    expect(count(logs, 'Remove')).toBe(1);
    expect(count(logs, 'Delete')).toBe(1);
    expect(count(logs, 'Create')).toBe(0);
    expect(count(logs, 'Insert')).toBe(0);
  });

  it('take one Remove, Delete, Create and Insert when the tile is swapped in one commit', () => {
    const { stage, tile } = build();
    const next = view(
      { width: TILE, height: TILE, backgroundColor: '#bb86fc' },
      'tile2',
    );

    removeChild(stage, tile);
    appendChild(stage, next);
    const logs = settle();

    expect([
      count(logs, 'Remove'),
      count(logs, 'Delete'),
      count(logs, 'Create'),
      count(logs, 'Insert'),
    ]).toEqual([1, 1, 1, 1]);
  });
});

report();
