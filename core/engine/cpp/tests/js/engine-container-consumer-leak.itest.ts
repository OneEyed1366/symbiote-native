// Rows reading a container query keep a list of the containers above them
// That is a child -> ancestor edge: a swapped-out screen must let it go or stay alive

import {
  appendChild,
  clearGlobalStyles,
  createElement,
  createSurface,
  disposeRoot,
  readSurfaceTelemetry,
  registerRules,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { collectGarbage, describe, expect, it, print, report } from './harness';

const ROOT_TAG = 1;
const SCREEN_SWAPS = 20;
// C++ frees a dropped tree one level per collection
const COLLECTIONS = 8;
const ROWS = 30;
const SLACK = 150;

const liveNodes = (): number => {
  for (let pass = 0; pass < COLLECTIONS; pass += 1) collectGarbage();
  return readSurfaceTelemetry(ROOT_TAG)?.liveNodes ?? -1;
};

const screen = (): ISymbioteNode => {
  const container = createElement('RCTView', false);
  routeProp(container, 'style', {
    width: 320,
    containerType: 'size',
    containerName: 'card',
  });
  for (let row = 0; row < ROWS; row += 1) {
    const child = createElement('RCTView', false);
    routeProp(child, 'className', 'card');
    appendChild(container, child);
  }
  return container;
};

const settle = (swaps: number): number => {
  clearGlobalStyles();
  registerRules(
    [
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 16 },
        cond: 0,
      },
    ],
    [['@', null, ['>=', 'width', 400]]],
  );
  const surface = createSurface(ROOT_TAG);
  let current = screen();
  surface.appendChild(current);
  surface.commit();
  for (let swap = 0; swap < swaps; swap += 1) {
    surface.removeChild(current);
    current = screen();
    surface.appendChild(current);
    surface.commit();
  }
  const live = liveNodes();
  surface.teardown();
  disposeRoot(ROOT_TAG);
  return live;
};

describe('container consumers on the real engine', () => {
  it('give back the screens they were swapped out of', () => {
    settle(1);
    const oneScreen = settle(1);
    const afterSwaps = settle(SCREEN_SWAPS);
    const afterMore = settle(SCREEN_SWAPS * 2);
    print(
      `container x${ROWS}: 1 screen ${oneScreen}, ${SCREEN_SWAPS} swaps ${afterSwaps}, ${SCREEN_SWAPS * 2} ${afterMore}`,
    );

    expect(oneScreen).toBeGreaterThan(0);
    expect(afterSwaps - oneScreen).toBeLessThan(SLACK + 1);
    expect(afterMore - afterSwaps).toBeLessThan(SLACK + 1);
  });
});

report();
