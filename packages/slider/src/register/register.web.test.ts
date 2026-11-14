// The web variant stands in for `./index` on the web platform, where Expo's resolver rejects the
// native component spec. Loading it must never evaluate that spec

import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-community/slider/dist/RNCSliderNativeComponent', () => {
  throw new Error('native slider spec evaluated on web');
});

describe('slider web register', () => {
  it('loads without evaluating the native component spec', async () => {
    await expect(import('./index.web')).resolves.toBeDefined();
  });
});
