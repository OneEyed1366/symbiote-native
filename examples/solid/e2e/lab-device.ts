import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { by, device, element, waitFor } from 'detox';
import { PNG } from 'pngjs';
import { countNear, SCREEN_TOLERANCE, type IRgb } from './pixel';

// What the specs of the device lab share: reading a readout, counting the pixels of a probe and
// reaching the styling screen. Sync is off from launch, since the app runs a native animation
// that never goes idle

export const LAUNCH = {
  newInstance: true,
  launchArgs: { detoxEnableSynchronization: 0 },
};
const LAB_SCROLL = 'style-showcase-scroll';
const TIMEOUT_MS = 10_000;
const POLL_MS = 250;
const SETTLE_MS = 300;
const SCROLL_STEP = 200;
const JUMP_MARGIN = 100;
const FAILURE_LINES = 12;
const SCROLL_START = 0.8;

const SWATCH_MIN_PIXELS = 500;
const GLYPH_MIN_PIXELS = 40;
const MAX_STRAY_PIXELS = 10;

export type IPaint = { color: IRgb; minPixels: number };

export const swatch = (color: IRgb): IPaint => ({
  color,
  minPixels: SWATCH_MIN_PIXELS,
});
export const glyph = (color: IRgb): IPaint => ({
  color,
  minPixels: GLYPH_MIN_PIXELS,
});

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// Reads until the value is the one wanted, so a repaint that lags a beat is not a failure
export async function pollUntil<T>(
  read: () => Promise<T>,
  isDone: (value: T) => boolean,
  what: string,
  deadline = Date.now() + TIMEOUT_MS,
): Promise<T> {
  const value = await read();
  if (isDone(value)) return value;
  if (Date.now() >= deadline) {
    throw new Error(
      `${what} never settled; last value ${JSON.stringify(value)}`,
    );
  }
  await sleep(POLL_MS);
  return pollUntil(read, isDone, what, deadline);
}

export async function readout(id: string): Promise<string> {
  const attributes = await element(by.id(id)).getAttributes();
  return 'text' in attributes && typeof attributes.text === 'string'
    ? attributes.text
    : '';
}

export type IScope = 'element' | 'screen';

// An element shot holds only what that view draws itself, never its child views, so a probe that
// lives inside a container is counted on the whole screen, where its colour is unique anyway
async function pixelCounts(
  id: string,
  colors: readonly IRgb[],
  scope: IScope,
): Promise<number[]> {
  const path =
    scope === 'screen'
      ? await device.takeScreenshot(`${id}-lab`)
      : await element(by.id(id)).takeScreenshot(`${id}-lab`);
  const image = PNG.sync.read(readFileSync(path));
  return colors.map(color =>
    countNear(image, color, scope === 'screen' ? SCREEN_TOLERANCE : undefined),
  );
}

// The wanted colours are in the element and the colours of the other branch are not
export async function expectPaint(
  id: string,
  wanted: readonly IPaint[],
  stray: readonly IRgb[],
  scope: IScope = 'element',
): Promise<void> {
  const colors = [...wanted.map(paint => paint.color), ...stray];
  await pollUntil(
    () => pixelCounts(id, colors, scope),
    counts =>
      counts.every((count, index) =>
        index < wanted.length
          ? count >= wanted[index].minPixels
          : count <= MAX_STRAY_PIXELS,
      ),
    `${id} paint`,
  );
}

// A rotation moves the probes. Where frames are reported the jump starts from anywhere, elsewhere
// the walk starts from the top, since a walk begun below the probe never finds it
export async function bringIntoView(id: string): Promise<void> {
  if ((await windowTop(id)) === undefined) {
    await element(by.id(LAB_SCROLL)).scrollTo('top');
  }
  await scrollDownTo(id);
}

// Where the top edge of an element sits in the window, read on iOS only
async function windowTop(id: string): Promise<number | undefined> {
  if (device.getPlatform() !== 'ios') return undefined;
  const attributes = await element(by.id(id)).getAttributes();
  return 'frame' in attributes && attributes.frame !== undefined
    ? attributes.frame.y
    : undefined;
}

// One scroll by the measured distance, since a walk of 200 points at a time takes minutes
async function jumpNear(id: string): Promise<void> {
  const probeTop = await windowTop(id);
  const boxTop = await windowTop(LAB_SCROLL);
  if (probeTop === undefined || boxTop === undefined) return;
  // At the foot of the screen there is nothing left to scroll, and the walk that follows decides
  await element(by.id(LAB_SCROLL))
    .scroll(
      Math.round(probeTop - boxTop - JUMP_MARGIN),
      'down',
      NaN,
      SCROLL_START,
    )
    .catch(() => undefined);
}

// Jumps close where iOS reports frames, then walks until the probe passes the visibility check
export async function scrollDownTo(id: string): Promise<void> {
  await jumpNear(id);
  await waitFor(element(by.id(id)))
    .toBeVisible()
    .whileElement(by.id(LAB_SCROLL))
    .scroll(SCROLL_STEP, 'down', NaN, SCROLL_START);
  await sleep(SETTLE_MS);
}

// With sync off a tap can find the view not hittable for a beat after a recommit
export async function tap(id: string): Promise<void> {
  let lastFailure = 'none';
  const read = () =>
    element(by.id(id))
      .tap()
      .then(
        () => true,
        (error: unknown) => {
          lastFailure = String(error)
            .split('\n')
            .slice(0, FAILURE_LINES)
            .join(' | ');
          return false;
        },
      );
  try {
    await pollUntil(read, isTapped => isTapped, `tap on ${id}`);
  } catch (error) {
    throw new Error(`${String(error)}; last tap failure: ${lastFailure}`);
  }
}

export async function openStyleShowcase(): Promise<void> {
  await waitFor(element(by.id('menu-row-FrameworkHub')))
    .toBeVisible()
    .withTimeout(TIMEOUT_MS);
  await tap('menu-row-FrameworkHub');
  await waitFor(element(by.id('menu-row-StyleShowcase')))
    .toBeVisible()
    .withTimeout(TIMEOUT_MS);
  await tap('menu-row-StyleShowcase');
  await waitForLab();
}

export async function waitForLab(): Promise<void> {
  await waitFor(element(by.id(LAB_SCROLL)))
    .toExist()
    .withTimeout(TIMEOUT_MS);
}

// Back to the list of examples, by the hardware key on Android and the edge swipe on iOS
export async function leaveStyleShowcase(): Promise<void> {
  if (device.getPlatform() === 'android') {
    await device.pressBack();
  } else {
    await element(by.id(LAB_SCROLL)).swipe('right', 'fast', 0.8, 0.02);
  }
  await waitFor(element(by.id(LAB_SCROLL)))
    .not.toExist()
    .withTimeout(TIMEOUT_MS);
  await waitFor(element(by.id('menu-row-StyleShowcase')))
    .toBeVisible()
    .withTimeout(TIMEOUT_MS);
}

// A tap while the list is still sliding back finds the row visible and opens nothing, so tap again
export async function reopenStyleShowcase(): Promise<void> {
  const tapUntilShown = async () => {
    const isShown = await element(by.id(LAB_SCROLL))
      .getAttributes()
      .then(
        () => true,
        () => false,
      );
    if (!isShown) {
      await element(by.id('menu-row-StyleShowcase'))
        .tap()
        .catch(() => undefined);
    }
    return isShown;
  };
  await pollUntil(
    tapUntilShown,
    isShown => isShown,
    'styling screen on the next visit',
  );
}

export type IScheme = 'light' | 'dark';

function adbPath(): string {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  return sdk === undefined ? 'adb' : `${sdk}/platform-tools/adb`;
}

// Detox 20 has no call for the device theme, so it is flipped from outside, as a person would
export function setScheme(scheme: IScheme): void {
  if (device.getPlatform() === 'android') {
    const night = scheme === 'dark' ? 'yes' : 'no';
    execFileSync(adbPath(), [
      '-s',
      device.id,
      'shell',
      'cmd',
      'uimode',
      'night',
      night,
    ]);
    return;
  }
  execFileSync('xcrun', ['simctl', 'ui', device.id, 'appearance', scheme]);
}

export function currentScheme(): IScheme {
  const reply =
    device.getPlatform() === 'android'
      ? execFileSync(
          adbPath(),
          ['-s', device.id, 'shell', 'cmd', 'uimode', 'night'],
          { encoding: 'utf8' },
        )
      : execFileSync('xcrun', ['simctl', 'ui', device.id, 'appearance'], {
          encoding: 'utf8',
        });
  return /yes|dark/i.test(reply) ? 'dark' : 'light';
}

export function changesIn(text: string): number {
  return Number(/changes=(\d+)/.exec(text)?.[1] ?? '0');
}

export function includesAll(text: string, parts: readonly string[]): boolean {
  return parts.every(part => text.toLowerCase().includes(part));
}
