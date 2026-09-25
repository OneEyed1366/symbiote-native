import { describe, expect, it } from 'vitest';
import { FlipType, SaveFormat } from './types';
import {
  validateActions,
  validateSaveOptions,
  validateUri,
} from './validators';

// Ported from expo-image-manipulator's src/__tests__/validators-test.ts (extent cases dropped —
// `extent` is web-only, not part of this port, see this package's README).
describe('validateUri', () => {
  it('rejects a non-string', () => {
    expect(() => validateUri(123 as never)).toThrow(/must be a string/);
  });

  it('accepts a valid uri', () => {
    expect(() => validateUri('file:///cache/a.jpg')).not.toThrow();
  });
});

describe('validateActions', () => {
  it('rejects an action with more than one transformation', () => {
    expect(() =>
      validateActions([{ flip: FlipType.Horizontal, rotate: 90 } as never]),
    ).toThrow();
  });

  it('rejects an invalid crop action', () => {
    expect(() =>
      validateActions([
        { crop: { originY: 10, width: true, height: 'blah' } as never },
      ]),
    ).toThrow(/Crop action must be an object of shape/);
  });

  it('accepts a valid crop action', () => {
    expect(() =>
      validateActions([
        { crop: { originX: 10, originY: 10, width: 100, height: 100 } },
      ]),
    ).not.toThrow();
  });

  it('rejects an invalid flip action', () => {
    expect(() => validateActions([{ flip: 'diagonal' as never }])).toThrow(
      /Unsupported flip type/,
    );
  });

  it('accepts a valid flip action', () => {
    expect(() =>
      validateActions([{ flip: FlipType.Horizontal }]),
    ).not.toThrow();
  });

  it('rejects an invalid rotate action', () => {
    expect(() => validateActions([{ rotate: true as never }])).toThrow(
      /Rotation must be a number/,
    );
  });

  it('accepts a valid rotate action', () => {
    expect(() => validateActions([{ rotate: 90 }])).not.toThrow();
  });

  it('rejects an invalid resize action', () => {
    expect(() =>
      validateActions([{ resize: { width: '321', height: 123 } as never }]),
    ).toThrow(/Resize action must be an object of shape/);
  });

  it('accepts a valid resize action, width/height/both', () => {
    expect(() =>
      validateActions([{ resize: { width: 123, height: 654 } }]),
    ).not.toThrow();
    expect(() => validateActions([{ resize: { width: 123 } }])).not.toThrow();
    expect(() => validateActions([{ resize: { height: 123 } }])).not.toThrow();
  });
});

describe('validateSaveOptions', () => {
  it('rejects an invalid base64', () => {
    expect(() => validateSaveOptions({ base64: 123 as never })).toThrow(
      /must be a boolean/,
    );
  });

  it('rejects an invalid compress', () => {
    expect(() => validateSaveOptions({ compress: 15 })).toThrow(
      /must be a number between 0 and 1/,
    );
  });

  it('rejects an invalid format', () => {
    expect(() => validateSaveOptions({ format: 'invalid' as never })).toThrow(
      /must be one of/,
    );
  });

  it('accepts valid save options', () => {
    expect(() =>
      validateSaveOptions({
        base64: true,
        compress: 0.5,
        format: SaveFormat.JPEG,
      }),
    ).not.toThrow();
  });
});
