import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCameraViewEvents } from './camera-view-events';

const QR = {
  type: 'qr',
  data: 'https://example.com',
  cornerPoints: [],
  bounds: { origin: { x: 0, y: 0 }, size: { width: 1, height: 1 } },
};

function eventOf(nativeEvent: object) {
  return { nativeEvent };
}

function handlerOf(events: object, name: string): (event: object) => void {
  const handler: unknown = Reflect.get(events, name);
  if (typeof handler !== 'function') throw new Error(`no ${name} handler`);
  return event => handler(event);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('createCameraViewEvents (Positive)', () => {
  it('calls onCameraReady without the native event', () => {
    const onCameraReady = vi.fn();
    const events = createCameraViewEvents()({ onCameraReady });

    handlerOf(events, 'onCameraReady')(eventOf({}));

    expect(onCameraReady).toHaveBeenCalledWith();
  });

  it.each([
    ['onMountError', { message: 'no camera' }],
    ['onAvailableLensesChanged', { lenses: ['builtInWideAngleCamera'] }],
    ['onResponsiveOrientationChanged', { orientation: 'landscapeLeft' }],
  ])('hands %s the native payload', (name, payload) => {
    const callback = vi.fn();
    const events = createCameraViewEvents()({ [name]: callback });

    handlerOf(events, name)(eventOf(payload));

    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('hands onBarcodeScanned the scanning result', () => {
    const onBarcodeScanned = vi.fn();
    const events = createCameraViewEvents()({ onBarcodeScanned });

    handlerOf(events, 'onBarcodeScanned')(eventOf(QR));

    expect(onBarcodeScanned).toHaveBeenCalledWith(QR);
  });

  it('reports a different barcode of the same type at once', () => {
    const onBarcodeScanned = vi.fn();
    const handle = handlerOf(
      createCameraViewEvents()({ onBarcodeScanned }),
      'onBarcodeScanned',
    );

    handle(eventOf(QR));
    handle(eventOf({ ...QR, data: 'other' }));

    expect(onBarcodeScanned).toHaveBeenCalledTimes(2);
  });

  it('reports the same barcode again after the throttle window', () => {
    const onBarcodeScanned = vi.fn();
    const handle = handlerOf(
      createCameraViewEvents()({ onBarcodeScanned }),
      'onBarcodeScanned',
    );

    handle(eventOf(QR));
    vi.advanceTimersByTime(500);
    handle(eventOf(QR));

    expect(onBarcodeScanned).toHaveBeenCalledTimes(2);
  });

  it('passes the picture saved event to the registered callbacks', () => {
    const events = createCameraViewEvents()({});

    expect(typeof Reflect.get(events, 'onPictureSaved')).toBe('function');
  });
});

describe('createCameraViewEvents (Negative)', () => {
  it('drops the same barcode repeated inside the throttle window', () => {
    const onBarcodeScanned = vi.fn();
    const handle = handlerOf(
      createCameraViewEvents()({ onBarcodeScanned }),
      'onBarcodeScanned',
    );

    handle(eventOf(QR));
    vi.advanceTimersByTime(499);
    handle(eventOf(QR));

    expect(onBarcodeScanned).toHaveBeenCalledTimes(1);
  });

  it('keeps the throttle of one view apart from another', () => {
    const first = vi.fn();
    const second = vi.fn();
    const make = createCameraViewEvents;

    handlerOf(
      make()({ onBarcodeScanned: first }),
      'onBarcodeScanned',
    )(eventOf(QR));
    handlerOf(
      make()({ onBarcodeScanned: second }),
      'onBarcodeScanned',
    )(eventOf(QR));

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('skips a payload that is not a scanning result', () => {
    const onBarcodeScanned = vi.fn();
    const events = createCameraViewEvents()({ onBarcodeScanned });

    handlerOf(events, 'onBarcodeScanned')(eventOf({ unrelated: true }));

    expect(onBarcodeScanned).not.toHaveBeenCalled();
  });

  it('has no barcode handler when the prop is missing', () => {
    const events = createCameraViewEvents()({});

    expect(Reflect.get(events, 'onBarcodeScanned')).toBeUndefined();
  });
});
