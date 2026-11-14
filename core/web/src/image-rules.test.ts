// Картинка в странице: источник идёт в `src` и `srcset`, режим масштабирования в `object-fit`

import { describe, expect, it } from 'vitest';
import { domSpecOf } from './dom-spec';
import { imageRules } from './image-rules';

const IMAGE = 'RCTImageView';

describe('image rules', () => {
  describe('source', () => {
    it('takes the uri of a resolved source', () => {
      expect(imageRules({ source: [{ uri: 'a.png' }] }).attributes).toEqual({
        src: 'a.png',
      });
    });

    it('turns scaled sources into a srcset', () => {
      const { attributes } = imageRules({
        source: [
          { uri: 'a.png', scale: 1 },
          { uri: 'a@2x.png', scale: 2 },
        ],
      });

      expect(attributes).toEqual({
        src: 'a.png',
        srcset: 'a.png 1x, a@2x.png 2x',
      });
    });

    it('takes a source object that was never wrapped', () => {
      expect(imageRules({ source: { uri: 'b.png' } }).attributes).toEqual({
        src: 'b.png',
      });
    });

    it('lets srcSet win over src, and src over source', () => {
      expect(
        imageRules({
          srcSet: 'x.png 1x, y.png 2x',
          src: 'z.png',
          source: [{ uri: 'w.png' }],
        }).attributes,
      ).toEqual({ srcset: 'x.png 1x, y.png 2x' });
      expect(
        imageRules({ src: 'z.png', source: [{ uri: 'w.png' }] }).attributes,
      ).toEqual({ src: 'z.png' });
    });

    it('writes nothing for a source without a uri', () => {
      expect(imageRules({ source: [{ width: 3 }] }).attributes).toEqual({});
      expect(imageRules({}).attributes).toEqual({});
    });
  });

  describe('resizeMode', () => {
    it.each([
      ['cover', 'cover'],
      ['contain', 'contain'],
      ['stretch', 'fill'],
      ['center', 'scale-down'],
    ])('maps %s to object-fit %s', (mode, fit) => {
      expect(imageRules({ resizeMode: mode }).css).toEqual({
        'object-fit': fit,
      });
    });

    it('leaves the default of the element for an unknown mode', () => {
      expect(imageRules({ resizeMode: 'repeat' }).css).toEqual({});
    });
  });

  describe('alt text', () => {
    it('reads the alt prop', () => {
      expect(imageRules({ alt: 'logo' }).attributes).toEqual({ alt: 'logo' });
    });
  });

  it('reaches the element spec of an image view only', () => {
    const image = domSpecOf(IMAGE, { src: 'a.png', resizeMode: 'cover' });
    const view = domSpecOf('RCTView', { src: 'a.png', resizeMode: 'cover' });

    expect(image.attributes.src).toBe('a.png');
    expect(image.css['object-fit']).toBe('cover');
    expect(view.attributes.src).toBeUndefined();
  });

  it('does not report the image props as skipped', () => {
    const skipped: string[] = [];

    domSpecOf(
      IMAGE,
      {
        src: 'a.png',
        srcSet: 'a.png 1x',
        source: [],
        resizeMode: 'cover',
        alt: '',
      },
      key => skipped.push(key),
    );

    expect(skipped).toEqual([]);
  });
});
