import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireNativeViewManager = vi.hoisted(() => vi.fn());

vi.mock('expo-modules-core', () => ({
  Platform: {
    OS: 'ios',
    select: (spec: Record<string, unknown>) => spec['ios'] ?? spec['default'],
  },
  SharedRef: class {},
  requireNativeViewManager,
  requireNativeModule: () => ({ ViewPrototypes: {} }),
}));

const { renderImageBackground } = await import('./image-background');

beforeEach(() => {
  requireNativeViewManager.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('renderImageBackground', () => {
  it('wraps an absolutely filled image in a view that takes the style', () => {
    const descriptor = renderImageBackground({
      source: 'https://x/a.png',
      style: { width: 100 },
      imageStyle: { opacity: 0.5 },
    });

    expect(descriptor.type).toBe('view');
    expect(descriptor.props.style).toEqual({ width: 100 });
    const [image] = descriptor.children;
    expect(image).toMatchObject({
      type: 'ViewManagerAdapter_ExpoImage',
      props: {
        source: [{ uri: 'https://x/a.png' }],
        style: { position: 'absolute', opacity: 0.5 },
      },
    });
  });

  it('gives the class to the wrapping view, like the style, and not to the image', () => {
    const descriptor = renderImageBackground({
      source: 'a',
      className: 'card',
    });

    expect(descriptor.props).toMatchObject({ className: 'card' });
    expect(descriptor.children[0]).not.toMatchObject({
      props: { className: 'card' },
    });
  });

  it('reads `class` the same way, the name Vue and Angular use', () => {
    const descriptor = renderImageBackground({
      source: 'a',
      ...{ class: 'card' },
    });

    expect(descriptor.props).toMatchObject({ class: 'card' });
    expect(descriptor.children[0]).not.toMatchObject({
      props: { class: 'card' },
    });
  });

  it('keeps the image callbacks on the image and not on the view', () => {
    const onLoad = vi.fn();
    const descriptor = renderImageBackground({ source: 'a', onLoad });

    expect(descriptor.props).not.toHaveProperty('onLoad');
    expect(descriptor.props).not.toHaveProperty('source');
  });

  it('paints the view alone when the image view cannot register', () => {
    requireNativeViewManager.mockImplementation(() => {
      throw new Error('no view');
    });

    expect(renderImageBackground({ source: 'a' }).children).toEqual([]);
  });
});
