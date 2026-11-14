import { device } from 'detox';
import {
  LAUNCH,
  bringIntoView,
  expectPaint,
  openStyleShowcase,
  swatch,
} from './lab-device';
import {
  AXIS_BOX_HELD,
  AXIS_BOX_PLAIN,
  AXIS_HEIGHT_HELD,
  AXIS_HEIGHT_PLAIN,
  AXIS_WIDTH_HELD,
  AXIS_WIDTH_PLAIN,
} from './lab-colors';

// R-13: an inline-size container answers a width query, not a height one, and never styles itself
// The probes are children of the container, so they are counted on the whole screen

describe('@container axes on a device', () => {
  beforeAll(async () => {
    await device.launchApp(LAUNCH);
    await openStyleShowcase();
    await bringIntoView('lab-axis-box');
  });

  it('holds a width query in an inline-size container', async () => {
    await expectPaint(
      'lab-axis-width',
      [swatch(AXIS_WIDTH_HELD)],
      [AXIS_WIDTH_PLAIN],
      'screen',
    );
  });

  it('answers false to a height query in the same container', async () => {
    await expectPaint(
      'lab-axis-height',
      [swatch(AXIS_HEIGHT_PLAIN)],
      [AXIS_HEIGHT_HELD],
      'screen',
    );
  });

  it('keeps the box plain although its own class carries a query that would hold', async () => {
    await expectPaint(
      'lab-axis-box',
      [swatch(AXIS_BOX_PLAIN)],
      [AXIS_BOX_HELD],
      'screen',
    );
  });
});
