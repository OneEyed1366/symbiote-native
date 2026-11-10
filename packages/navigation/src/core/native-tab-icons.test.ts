import { describe, expect, it, vi } from 'vitest';
import { setImageSourceResolver } from '@symbiote-native/components';
import { resolveTabIconsAndroid, resolveTabIconsIOS } from './native-tab-icons';

const PNG = { uri: 'https://example.test/tab.png' };

describe('tab icons on iOS', () => {
  it('sends an SF symbol by name with its rendering mode', () => {
    expect(
      resolveTabIconsIOS(
        { type: 'sfSymbol', name: 'house', renderingMode: 'monochrome' },
        undefined,
      ),
    ).toEqual({
      iconType: 'sfSymbol',
      iconSymbolRenderingMode: 'monochrome',
      iconResourceName: 'house',
    });
  });

  it('sends an xcasset by name', () => {
    expect(
      resolveTabIconsIOS({ type: 'xcasset', name: 'home' }, undefined),
    ).toEqual({ iconType: 'xcasset', iconResourceName: 'home' });
  });

  it('sends an image source as an image with the chosen rendering mode', () => {
    expect(
      resolveTabIconsIOS(
        { type: 'imageSource', imageSource: PNG, renderingMode: 'original' },
        undefined,
      ),
    ).toEqual({
      iconType: 'image',
      iconImageRenderingMode: 'original',
      iconImageSource: PNG,
    });
  });

  it('renders a template source as a template image', () => {
    expect(
      resolveTabIconsIOS(
        { type: 'templateSource', templateSource: PNG },
        undefined,
      ),
    ).toEqual({
      iconType: 'image',
      iconImageRenderingMode: 'template',
      iconImageSource: PNG,
    });
  });

  it('sends the selected icon under its own keys', () => {
    const props = resolveTabIconsIOS(
      { type: 'sfSymbol', name: 'house' },
      { type: 'sfSymbol', name: 'house.fill', renderingMode: 'original' },
    );

    expect(props.selectedIconResourceName).toBe('house.fill');
    expect(props.selectedIconSymbolRenderingMode).toBe('original');
    expect(props.iconResourceName).toBe('house');
  });

  it('sends nothing when the app sets no icon', () => {
    expect(resolveTabIconsIOS(undefined, undefined)).toEqual({});
  });

  it('refuses a selected icon of another type than the icon', () => {
    expect(() =>
      resolveTabIconsIOS(
        { type: 'sfSymbol', name: 'house' },
        { type: 'xcasset', name: 'home' },
      ),
    ).toThrow('icon and selectedIcon must be same type');
  });

  it('refuses a selected icon without an icon', () => {
    expect(() =>
      resolveTabIconsIOS(undefined, { type: 'sfSymbol', name: 'house' }),
    ).toThrow('the icon prop must also be provided');
  });
});

describe('tab icons on Android', () => {
  it('sends a drawable resource by name with its tinting', () => {
    expect(
      resolveTabIconsAndroid(
        { type: 'drawableResource', name: 'ic_home', tinting: 'original' },
        undefined,
      ),
    ).toEqual({
      drawableIconResourceName: 'ic_home',
      iconTinting: 'original',
    });
  });

  it('resolves an image source to the asset the host expects', () => {
    const props = resolveTabIconsAndroid(
      { type: 'imageSource', imageSource: PNG },
      undefined,
    );

    expect(props.imageIconResource).toMatchObject({ uri: PNG.uri });
  });

  it('reports an asset id that resolves to nothing and sends no icon', () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    setImageSourceResolver(() => null);

    const props = resolveTabIconsAndroid(
      { type: 'imageSource', imageSource: 987_654_321 },
      undefined,
    );

    setImageSourceResolver(source => source);
    expect(logError).toHaveBeenCalledWith(
      '[RNScreens] Failed to resolve an asset.',
    );
    expect(props.imageIconResource).toBeUndefined();
    logError.mockRestore();
  });

  it('sends the selected icon under its own keys', () => {
    const props = resolveTabIconsAndroid(
      { type: 'drawableResource', name: 'ic_home' },
      { type: 'drawableResource', name: 'ic_home_fill', tinting: 'tinted' },
    );

    expect(props.selectedDrawableIconResourceName).toBe('ic_home_fill');
    expect(props.selectedIconTinting).toBe('tinted');
  });

  it('sends nothing when the app sets no icon', () => {
    expect(resolveTabIconsAndroid(undefined, undefined)).toEqual({});
  });
});
