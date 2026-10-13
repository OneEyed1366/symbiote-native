// The section of the React example itself, every preset, pressed like a finger would
// @symbiote-react-jsx
// The driver comes first: it sets up the globals Reanimated reads when it loads
import {
  frames,
  startScreen,
  stopScreen,
  tap,
} from './reanimated-screen-driver';
import { createElement as h } from 'react';

import { EnteringExitingSection } from '../../../../../examples/react/screens/reanimated/EnteringExitingSection';
import '../../../../../packages/reanimated/src/register';
import { afterEach, beforeEach, describe, expect, it, report } from './harness';

// Class names resolve to nothing here, so sizes are zero; the tree and the animations are real
const MAX_FRAMES = 90;
const SETTLE_FRAMES = 40;
const PRESET_COUNT = 10;
const BUTTONS = ['ra-preset-toggle', 'ra-preset-next'] as const;
const TILE = 'ra-preset-tile';

const run = (count: number): number[] => frames(count, BUTTONS, TILE);

beforeEach(() => {
  startScreen(h('view', { testID: 'app' }, h(EnteringExitingSection)));
});
afterEach(stopScreen);

describe('every preset of the example section', () => {
  it('hides its tile at the end of the exit and keeps the buttons on every frame', () => {
    const outcomes: string[] = [];
    for (let preset = 0; preset < PRESET_COUNT; preset += 1) {
      run(SETTLE_FRAMES);
      tap('ra-preset-toggle');
      const hidden = run(MAX_FRAMES);
      tap('ra-preset-toggle');
      run(SETTLE_FRAMES);
      outcomes.push(`${preset}:${hidden[0]}>${hidden[hidden.length - 1]}`);
      tap('ra-preset-next');
    }

    expect(outcomes.length).toBe(PRESET_COUNT);
    expect(outcomes.every(one => one.endsWith(':1>0'))).toBe(true);
  });
});

report();
