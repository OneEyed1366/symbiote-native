import { device } from 'detox';
import {
  LAUNCH,
  bringIntoView,
  expectPaint,
  openStyleShowcase,
  swatch,
  tap,
} from './lab-device';
import { PREC_NODE, PREC_ROOT, PREC_SURFACE } from './lab-colors';

// R-12: a `var()` takes the value a node declares, else the one its surface wrote, else `:root`
// Only the pixels tell which level answered, so each step names the colours that must be gone

describe('var() precedence on a device', () => {
  beforeAll(async () => {
    await device.launchApp(LAUNCH);
    await openStyleShowcase();
    await bringIntoView('lab-prec-surface-toggle');
  });

  it('paints the :root token while nothing above it is set', async () => {
    await expectPaint(
      'lab-prec-swatch',
      [swatch(PREC_ROOT)],
      [PREC_SURFACE, PREC_NODE],
    );
  });

  it('prefers the value the surface writes to :root', async () => {
    await tap('lab-prec-surface-toggle');

    await expectPaint(
      'lab-prec-swatch',
      [swatch(PREC_SURFACE)],
      [PREC_ROOT, PREC_NODE],
    );
  });

  it('prefers a value declared on the node to the surface', async () => {
    await tap('lab-prec-node-toggle');

    await expectPaint(
      'lab-prec-swatch',
      [swatch(PREC_NODE)],
      [PREC_ROOT, PREC_SURFACE],
    );
  });

  it('falls back to the surface once the node drops its own', async () => {
    await tap('lab-prec-node-toggle');

    await expectPaint(
      'lab-prec-swatch',
      [swatch(PREC_SURFACE)],
      [PREC_ROOT, PREC_NODE],
    );
  });

  it('falls back to :root once the surface drops its own', async () => {
    await tap('lab-prec-surface-toggle');

    await expectPaint(
      'lab-prec-swatch',
      [swatch(PREC_ROOT)],
      [PREC_SURFACE, PREC_NODE],
    );
  });
});
