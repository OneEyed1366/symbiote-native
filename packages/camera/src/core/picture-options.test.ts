import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensurePictureOptions,
  ensureRecordingOptions,
  handlePictureSaved,
} from './picture-options';
import type { ICameraCapturedPicture } from './types';

const PICTURE: ICameraCapturedPicture = {
  width: 10,
  height: 20,
  format: 'jpg',
  uri: 'file:///p.jpg',
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  warn.mockClear();
});

describe('ensurePictureOptions', () => {
  it('defaults the quality to 1', () => {
    expect(ensurePictureOptions({ base64: true })).toEqual({
      quality: 1,
      base64: true,
    });
  });

  it('keeps a quality that was given', () => {
    expect(ensurePictureOptions({ quality: 0.3 })).toMatchObject({
      quality: 0.3,
    });
  });

  it('answers an empty object when there are no options', () => {
    expect(ensurePictureOptions(undefined)).toEqual({});
  });

  it('does not change the options of the caller', () => {
    const options = { onPictureSaved: vi.fn() };

    ensurePictureOptions(options);

    expect(options).toEqual({ onPictureSaved: options.onPictureSaved });
  });

  it('warns that the mirror option is deprecated', () => {
    ensurePictureOptions({ mirror: true });

    expect(warn).toHaveBeenCalledWith(
      'The `mirror` option is deprecated. Please use the `mirror` prop on the `CameraView` instead.',
    );
  });

  it('gives a picture with a callback an id and turns the fast mode on', () => {
    const options = ensurePictureOptions({ onPictureSaved: vi.fn() });

    expect(options).toMatchObject({ fastMode: true, id: expect.any(Number) });
  });

  it('gives every callback its own id', () => {
    const first = ensurePictureOptions({ onPictureSaved: vi.fn() });
    const second = ensurePictureOptions({ onPictureSaved: vi.fn() });

    expect(first.id).not.toBe(second.id);
  });
});

describe('ensureRecordingOptions', () => {
  it('passes the options through', () => {
    expect(ensureRecordingOptions({ maxDuration: 5 })).toEqual({
      maxDuration: 5,
    });
  });

  it('defaults to no options', () => {
    expect(ensureRecordingOptions()).toEqual({});
  });

  it('warns that the mirror option is deprecated', () => {
    ensureRecordingOptions({ mirror: true });

    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('handlePictureSaved', () => {
  it('hands the picture to the callback registered under the id of the event', () => {
    const onPictureSaved = vi.fn();
    const { id } = ensurePictureOptions({ onPictureSaved });

    handlePictureSaved({ nativeEvent: { id: id ?? -1, data: PICTURE } });

    expect(onPictureSaved).toHaveBeenCalledWith(PICTURE);
  });

  it('calls the callback once, the id is released afterwards', () => {
    const onPictureSaved = vi.fn();
    const { id } = ensurePictureOptions({ onPictureSaved });
    const event = { nativeEvent: { id: id ?? -1, data: PICTURE } };

    handlePictureSaved(event);
    handlePictureSaved(event);

    expect(onPictureSaved).toHaveBeenCalledTimes(1);
  });

  it('ignores an event of an id nobody registered', () => {
    expect(() =>
      handlePictureSaved({ nativeEvent: { id: 9_999, data: PICTURE } }),
    ).not.toThrow();
  });
});
