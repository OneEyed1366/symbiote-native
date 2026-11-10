// The "Entering and exiting" section as the React example renders it, trimmed to the tile and its
// two buttons and pressed like a finger would, over the real engine and the real proxy
// The driver comes first: it sets up the globals Reanimated reads when it loads
import {
  frames,
  settle,
  startScreen,
  stopScreen,
  tap,
} from './reanimated-screen-driver';
import { createElement as h, useState } from 'react';

import Animated, {
  FadeIn,
  FadeOut,
  FlipInXUp,
  FlipOutXDown,
} from '../../../../../packages/reanimated/src/react/index';
import '../../../../../packages/reanimated/src/register';
import { afterEach, beforeEach, describe, expect, it, report } from './harness';
import { advance } from './reanimated-fake-time';

const TILE = 60;
const FRAME_MS = 16;
const MAX_FRAMES = 120;
const BUTTONS = ['toggle', 'next'] as const;

type IPreset = { name: string; entering: unknown; exiting: unknown };

const FLIP: IPreset = {
  name: 'Flip',
  entering: FlipInXUp,
  exiting: FlipOutXDown,
};
const FADE: IPreset = { name: 'Fade', entering: FadeIn, exiting: FadeOut };
const PRESETS: readonly IPreset[] = [FLIP, FADE];

const BUTTON = { borderWidth: 2, borderColor: '#6ad48b', padding: 8 };

function Button(props: { testID: string; title: string; onPress: () => void }) {
  return h(
    'pressable',
    {
      testID: props.testID,
      onPress: props.onPress,
      style: ({ pressed }: { pressed: boolean }) => ({
        ...BUTTON,
        opacity: pressed ? 0.6 : 1,
      }),
    },
    h('text', null, props.title),
  );
}

function nextPreset(current: IPreset): IPreset {
  return PRESETS[(PRESETS.indexOf(current) + 1) % PRESETS.length];
}

function Section() {
  const [preset, setPreset] = useState(FLIP);
  const [isTileShown, setIsTileShown] = useState(true);
  return h(
    'view',
    {
      testID: 'section',
      style: { padding: 12, gap: 12, backgroundColor: '#12263a' },
    },
    h('text', null, `preset: ${preset.name}`),
    h(
      'view',
      { style: { minHeight: 70, justifyContent: 'center' } },
      isTileShown
        ? h(Animated.View, {
            key: preset.name,
            testID: 'tile',
            style: { width: TILE, height: TILE, backgroundColor: '#6ad48b' },
            entering: preset.entering,
            exiting: preset.exiting,
          })
        : null,
    ),
    h(
      'view',
      { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } },
      h(Button, {
        testID: 'toggle',
        title: isTileShown ? 'hide' : 'show',
        onPress: () => setIsTileShown(!isTileShown),
      }),
      h(Button, {
        testID: 'next',
        title: 'next preset',
        onPress: () => setPreset(nextPreset(preset)),
      }),
    ),
  );
}

const run = (): number[] => frames(MAX_FRAMES, BUTTONS, 'tile');
const last = (seen: number[]): number | undefined => seen[seen.length - 1];

beforeEach(() => startScreen(h(Section)));
afterEach(stopScreen);

describe('the section as the example renders it, with the real animation manager', () => {
  it('runs the entering animation to its end and leaves one tile', () => {
    expect(run().every(count => count === 1)).toBe(true);
  });

  it('takes the tile off on its own once the exit of hide has run, buttons kept', () => {
    run();
    tap('toggle');
    const seen = run();

    expect(seen[0]).toBe(1);
    expect(last(seen)).toBe(0);
  });

  it('does the same when hide is pressed while the entering animation still runs', () => {
    advance(FRAME_MS * 3);
    settle();
    tap('toggle');

    expect(last(run())).toBe(0);
  });

  it('swaps the tile on next preset and ends with one tile and both buttons', () => {
    run();
    tap('next');
    const seen = run();

    expect(seen[0]).toBe(2);
    expect(last(seen)).toBe(1);
  });

  it('survives hide, show, hide and next preset in a row', () => {
    for (const button of ['toggle', 'toggle', 'next', 'toggle']) {
      run();
      tap(button);
    }

    expect(last(run())).toBe(0);
  });
});

report();
