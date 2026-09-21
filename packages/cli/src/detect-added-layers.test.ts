import { describe, expect, it } from 'vitest';
import { detectAddedLayers } from './detect-added-layers.js';
import { EXPO_PACKAGE_LAYERS } from './expo-package-layers.js';

// `add` offers only layers NOT already present when run with no flags — this is what tells it
// which ones already are, from the same package.json dependency markers each layer's own
// package.json.fragment.json declares.
describe('detectAddedLayers', () => {
  it('detects navigation via @symbiote-native/navigation', () => {
    expect(
      detectAddedLayers({ '@symbiote-native/navigation': 'latest' }),
    ).toEqual(new Set(['navigation']));
  });

  it('detects expo-modules via @symbiote-native/expo-modules-link', () => {
    expect(
      detectAddedLayers({ '@symbiote-native/expo-modules-link': 'latest' }),
    ).toEqual(new Set(['expo-modules']));
  });

  it('detects testing via detox', () => {
    expect(detectAddedLayers({ detox: '^20.0.0' })).toEqual(
      new Set(['testing']),
    );
  });

  it('detects slider via @symbiote-native/slider', () => {
    expect(detectAddedLayers({ '@symbiote-native/slider': 'latest' })).toEqual(
      new Set(['slider']),
    );
  });

  it('detects splash-screen via @symbiote-native/splash-screen', () => {
    expect(
      detectAddedLayers({ '@symbiote-native/splash-screen': 'latest' }),
    ).toEqual(new Set(['splash-screen']));
  });

  it('detects multiple layers at once', () => {
    expect(
      detectAddedLayers({
        '@symbiote-native/navigation': 'latest',
        detox: '^20.0.0',
      }),
    ).toEqual(new Set(['navigation', 'testing']));
  });

  it('returns an empty set for a fresh app with no optional layers yet', () => {
    expect(detectAddedLayers({ '@symbiote-native/react': '1.0.0' })).toEqual(
      new Set(),
    );
  });

  it.each(EXPO_PACKAGE_LAYERS)('detects $id via $symbiotePackage', layer => {
    expect(detectAddedLayers({ [layer.symbiotePackage]: 'latest' })).toEqual(
      new Set([layer.id]),
    );
  });
});
