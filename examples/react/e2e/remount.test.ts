import { device } from 'detox';
import { expect } from '@jest/globals';
import {
  LAUNCH,
  bringIntoView,
  changesIn,
  expectPaint,
  includesAll,
  leaveStyleShowcase,
  openStyleShowcase,
  pollUntil,
  readout,
  reopenStyleShowcase,
  swatch,
  tap,
} from './lab-device';
import {
  AMBER,
  PREC_ROOT,
  PREC_SURFACE,
  ROSE,
  TEAL,
  VIOLET,
} from './lab-colors';

// R-14: a value the surface wrote does not outlive the screen, and `matchMedia` works on the next
// visit. The screen is left and entered again inside one app run, so the surface stays the same

// Five walks down a long screen, which Android makes by scrolling step by step
const JOURNEY_TIMEOUT_MS = 300_000;

describe('leaving the styling screen and coming back', () => {
  beforeAll(async () => {
    await device.launchApp(LAUNCH);
    await openStyleShowcase();
  });

  // A failed run must not leave the device turned for the next suite
  afterAll(async () => {
    await device.setOrientation('portrait');
  });

  it(
    'writes to the surface, leaves, and finds :root again on the next visit',
    async () => {
      await bringIntoView('lab-var-toggle');
      await tap('lab-var-toggle');
      await pollUntil(
        () => readout('lab-var-readout'),
        text => includesAll(text, ['ffbe0b']),
        'written readout',
      );
      await bringIntoView('lab-prec-surface-toggle');
      await tap('lab-prec-surface-toggle');
      await expectPaint('lab-prec-swatch', [swatch(PREC_SURFACE)], [PREC_ROOT]);

      await leaveStyleShowcase();
      await reopenStyleShowcase();

      await bringIntoView('lab-var-swatch');
      await pollUntil(
        () => readout('lab-var-readout'),
        text => includesAll(text, ['8338ec']),
        'token readout after the visit',
      );
      await expectPaint('lab-var-swatch', [swatch(VIOLET)], [AMBER]);
      await bringIntoView('lab-prec-swatch');
      await expectPaint('lab-prec-swatch', [swatch(PREC_ROOT)], [PREC_SURFACE]);
    },
    JOURNEY_TIMEOUT_MS,
  );

  it('answers a rotation on the next visit, counting only its own changes', async () => {
    await device.setOrientation('landscape');
    await bringIntoView('lab-media-swatch');

    const text = await pollUntil(
      () => readout('lab-media-readout'),
      value => includesAll(value, ['wide=true', 'landscape=true']),
      'landscape readout after the visit',
    );
    expect(changesIn(text)).toBe(2);
    await expectPaint('lab-media-swatch', [swatch(TEAL)], [ROSE]);
  });
});
