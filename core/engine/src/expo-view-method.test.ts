import { describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createElement, createSurface, getNativeTag } from './index';
import { defineExpoViewMethods } from './expo-view-method';

installRecordingFabric();
let nextRootTag = 9700;

function mountedNode() {
  const surface = createSurface((nextRootTag += 1));
  const node = createElement('RCTView');
  surface.appendChild(node);
  surface.commit();
  return node;
}

function moduleWith(prototypes: Record<string, Record<string, unknown>>) {
  return { requireModule: () => ({ ViewPrototypes: prototypes }) };
}

describe('defineExpoViewMethods (Positive)', () => {
  it('calls the view function with the native tag of the mounted view and returns its result', () => {
    const node = mountedNode();
    const startPlayback = vi.fn(function (this: unknown) {
      return 'started';
    });
    const call = defineExpoViewMethods(
      moduleWith({ ExpoLivePhoto: { startPlayback } }).requireModule,
      'ExpoLivePhoto',
    );

    const result = call(node, 'startPlayback', ['hint']);

    expect(result).toBe('started');
    expect(startPlayback).toHaveBeenCalledWith('hint');
    expect(startPlayback.mock.contexts[0]).toEqual({
      nativeTag: getNativeTag(node),
    });
  });

  it('looks a module with several views up under the module and the view name', () => {
    const node = mountedNode();
    const present = vi.fn();
    const call = defineExpoViewMethods(
      moduleWith({ ExpoVideo_VideoView: { present } }).requireModule,
      'ExpoVideo',
      'VideoView',
    );

    call(node, 'present', []);

    expect(present).toHaveBeenCalledTimes(1);
  });
});

describe('defineExpoViewMethods (Negative)', () => {
  it('throws before the view has committed, there is no native tag to address', () => {
    const detached = createElement('RCTView');
    const call = defineExpoViewMethods(
      moduleWith({ ExpoLivePhoto: { stopPlayback: vi.fn() } }).requireModule,
      'ExpoLivePhoto',
    );

    expect(() => call(detached, 'stopPlayback', [])).toThrow(
      'ExpoLivePhoto.stopPlayback: the view is not mounted yet',
    );
  });

  it('throws when the native view has no function of that name', () => {
    const node = mountedNode();
    const call = defineExpoViewMethods(
      moduleWith({ ExpoLivePhoto: {} }).requireModule,
      'ExpoLivePhoto',
    );

    expect(() => call(node, 'startPlayback', [])).toThrow(
      'ExpoLivePhoto.startPlayback is not a native view function',
    );
  });

  it('throws when the native module is missing', () => {
    const node = mountedNode();
    const call = defineExpoViewMethods(() => {
      throw new Error('Cannot find native module');
    }, 'ExpoLivePhoto');

    expect(() => call(node, 'startPlayback', [])).toThrow(
      'Cannot find native module',
    );
  });
});
