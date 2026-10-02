import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaTypeOptions } from './types';
import { mapDeprecatedOptions, parseMediaTypes } from './utils';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseMediaTypes', () => {
  it('maps the deprecated All/Images/Videos enum and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(parseMediaTypes(MediaTypeOptions.All)).toEqual(['images', 'videos']);
    expect(parseMediaTypes(MediaTypeOptions.Images)).toEqual(['images']);
    expect(parseMediaTypes(MediaTypeOptions.Videos)).toEqual(['videos']);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('wraps a single media type string into an array', () => {
    expect(parseMediaTypes('images')).toEqual(['images']);
  });

  it('passes an array of media types through unchanged', () => {
    expect(parseMediaTypes(['images', 'videos'])).toEqual(['images', 'videos']);
  });
});

describe('mapDeprecatedOptions', () => {
  it('leaves options without mediaTypes untouched', () => {
    const options = { quality: 0.5 };
    expect(mapDeprecatedOptions(options)).toBe(options);
  });

  it('normalizes mediaTypes in place', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      mapDeprecatedOptions({ mediaTypes: MediaTypeOptions.Videos }),
    ).toEqual({
      mediaTypes: ['videos'],
    });
  });
});
