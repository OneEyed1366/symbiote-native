import { device } from 'detox';
// Detox installs its own global `expect`, which takes elements, not numbers
import { expect } from '@jest/globals';
import {
  LAUNCH,
  bringIntoView,
  changesIn,
  expectPaint,
  glyph,
  includesAll,
  openStyleShowcase,
  pollUntil,
  readout,
  scrollDownTo,
  swatch,
  tap,
} from './lab-device';
import {
  AMBER,
  BLUE,
  DARK,
  FIRST_GLYPH_HELD,
  FIRST_GLYPH_PLAIN,
  GLYPH_HELD,
  GLYPH_PLAIN,
  ORANGE,
  PINK,
  ROSE,
  TEAL,
  VIOLET,
} from './lab-colors';

// Runs `@media`, `matchMedia`, `@container` and `var()` on a device against `lab-panels.tsx`
// The readout says what the engine answered, pixels near the probe colour say what was painted

// Both queries flip on each turn, so the readout counts two changes per rotation
const CHANGES_AFTER_LANDSCAPE = 2;
const CHANGES_AFTER_RETURN = 4;

describe('@media and matchMedia on a device', () => {
  beforeAll(async () => {
    await device.launchApp(LAUNCH);
    await openStyleShowcase();
  });

  // A failed run must not leave the simulator turned for the next suite
  afterAll(async () => {
    await device.setOrientation('portrait');
  });

  it('answers false and paints the narrow colour in portrait', async () => {
    await bringIntoView('lab-media-swatch');

    await pollUntil(
      () => readout('lab-media-readout'),
      text => includesAll(text, ['wide=false', 'landscape=false']),
      'portrait readout',
    );
    await expectPaint('lab-media-swatch', [swatch(ROSE)], [TEAL]);
  });

  it('flips both queries and repaints when the device turns to landscape', async () => {
    await device.setOrientation('landscape');
    await bringIntoView('lab-media-swatch');

    const text = await pollUntil(
      () => readout('lab-media-readout'),
      value => includesAll(value, ['wide=true', 'landscape=true']),
      'landscape readout',
    );
    expect(changesIn(text)).toBeGreaterThanOrEqual(CHANGES_AFTER_LANDSCAPE);
    await expectPaint('lab-media-swatch', [swatch(TEAL)], [ROSE]);
  });

  it('flips back and repaints when the device returns to portrait', async () => {
    await device.setOrientation('portrait');
    await bringIntoView('lab-media-swatch');

    const text = await pollUntil(
      () => readout('lab-media-readout'),
      value => includesAll(value, ['wide=false', 'landscape=false']),
      'portrait again readout',
    );
    expect(changesIn(text)).toBeGreaterThanOrEqual(CHANGES_AFTER_RETURN);
    await expectPaint('lab-media-swatch', [swatch(ROSE)], [TEAL]);
  });
});

describe('@container on a device', () => {
  beforeAll(async () => {
    await device.launchApp(LAUNCH);
    await openStyleShowcase();
  });

  it('styles a box that is wide from its first frame, text nested in a text included', async () => {
    await bringIntoView('lab-container-first');

    await expectPaint(
      'lab-container-first',
      [swatch(BLUE), glyph(FIRST_GLYPH_HELD)],
      [PINK, FIRST_GLYPH_PLAIN],
      'screen',
    );
  });

  it('keeps the plain colours in a box that is narrow', async () => {
    await bringIntoView('lab-container');

    await pollUntil(
      () => readout('lab-container-readout'),
      text => includesAll(text, ['container=200', 'laid-out=200']),
      'narrow readout',
    );
    await expectPaint(
      'lab-container',
      [swatch(ORANGE), glyph(GLYPH_PLAIN)],
      [DARK, GLYPH_HELD],
      'screen',
    );
  });

  it('restyles the swatch and the nested text once the button widens the box', async () => {
    await scrollDownTo('lab-container-toggle');
    await tap('lab-container-toggle');

    await pollUntil(
      () => readout('lab-container-readout'),
      text => includesAll(text, ['container=320', 'laid-out=320']),
      'wide readout',
    );
    await expectPaint(
      'lab-container',
      [swatch(DARK), glyph(GLYPH_HELD)],
      [ORANGE, GLYPH_PLAIN],
      'screen',
    );
  });

  it('restyles back once the button narrows the box again', async () => {
    await scrollDownTo('lab-container-toggle');
    await tap('lab-container-toggle');

    await pollUntil(
      () => readout('lab-container-readout'),
      text => includesAll(text, ['container=200', 'laid-out=200']),
      'narrow again readout',
    );
    await expectPaint(
      'lab-container',
      [swatch(ORANGE), glyph(GLYPH_PLAIN)],
      [DARK, GLYPH_HELD],
      'screen',
    );
  });
});

describe('var() and setVariable on a device', () => {
  beforeAll(async () => {
    await device.launchApp(LAUNCH);
    await openStyleShowcase();
  });

  it('paints the :root token and reads it back', async () => {
    await bringIntoView('lab-var-swatch');

    await pollUntil(
      () => readout('lab-var-readout'),
      text => includesAll(text, ['--lab-accent', '8338ec']),
      'token readout',
    );
    await expectPaint('lab-var-swatch', [swatch(VIOLET)], [AMBER]);
  });

  it('repaints and reads the new value once the surface writes its own', async () => {
    await bringIntoView('lab-var-toggle');
    await tap('lab-var-toggle');

    await pollUntil(
      () => readout('lab-var-readout'),
      text => includesAll(text, ['ffbe0b']),
      'written readout',
    );
    await expectPaint('lab-var-swatch', [swatch(AMBER)], [VIOLET]);
  });

  it('falls back to the :root token once the write is dropped', async () => {
    await bringIntoView('lab-var-toggle');
    await tap('lab-var-toggle');

    await pollUntil(
      () => readout('lab-var-readout'),
      text => includesAll(text, ['8338ec']),
      'dropped readout',
    );
    await expectPaint('lab-var-swatch', [swatch(VIOLET)], [AMBER]);
  });
});
