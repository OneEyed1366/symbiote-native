// RN's `ImageURISource` also carries the request (`method`, `headers`, `body`, `cache`)

import { describe, expect, it } from 'vitest';
import type { IImageSource } from './image-source-resolver';

describe('IImageSource', () => {
  it('describes a remote request the way RN does', () => {
    // A fresh literal, so an unknown key is an excess-property error
    const source: IImageSource = {
      uri: 'https://example.test/a.png',
      method: 'POST',
      headers: { Authorization: 'token' },
      body: 'a=1',
      cache: 'force-cache',
      bundle: 'Assets',
    };

    expect(source.cache).toBe('force-cache');
  });
});
