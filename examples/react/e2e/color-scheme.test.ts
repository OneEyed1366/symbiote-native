import { device } from 'detox';
import { expect } from '@jest/globals';
import {
  LAUNCH,
  bringIntoView,
  changesIn,
  currentScheme,
  expectPaint,
  includesAll,
  openStyleShowcase,
  pollUntil,
  readout,
  setScheme,
  swatch,
  type IScheme,
} from './lab-device';
import { SCHEME_DARK, SCHEME_LIGHT } from './lab-colors';

// R-15: `prefers-color-scheme` follows the theme of the device, for the query and for a rule
// Detox 20 cannot turn the theme, so the helper does it from outside and the test restores it

describe('prefers-color-scheme on a device', () => {
  let original: IScheme = 'light';

  beforeAll(async () => {
    original = currentScheme();
    setScheme('light');
    await device.launchApp(LAUNCH);
    await openStyleShowcase();
    await bringIntoView('lab-scheme-swatch');
  });

  afterAll(() => {
    setScheme(original);
  });

  it('answers false and paints the light colour on a light device', async () => {
    await pollUntil(
      () => readout('lab-scheme-readout'),
      text => includesAll(text, ['dark=false']),
      'light readout',
    );
    await expectPaint(
      'lab-scheme-swatch',
      [swatch(SCHEME_LIGHT)],
      [SCHEME_DARK],
    );
  });

  it('flips the query and repaints when the device goes dark', async () => {
    setScheme('dark');

    const text = await pollUntil(
      () => readout('lab-scheme-readout'),
      value => includesAll(value, ['dark=true']),
      'dark readout',
    );
    expect(changesIn(text)).toBeGreaterThanOrEqual(1);
    await expectPaint(
      'lab-scheme-swatch',
      [swatch(SCHEME_DARK)],
      [SCHEME_LIGHT],
    );
  });

  it('flips back when the device returns to light', async () => {
    setScheme('light');

    await pollUntil(
      () => readout('lab-scheme-readout'),
      text => includesAll(text, ['dark=false']),
      'light again readout',
    );
    await expectPaint(
      'lab-scheme-swatch',
      [swatch(SCHEME_LIGHT)],
      [SCHEME_DARK],
    );
  });
});
