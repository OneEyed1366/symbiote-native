import { splitProps } from 'solid-js';
import { descriptorToSolid } from '@symbiote-native/solid';
import { createHostNodeHolder } from '@symbiote-native/components';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { createLivePhotoViewHandle, renderLivePhotoView } from '../core';
import type { ILivePhotoViewHandle, ILivePhotoViewProps } from '../core';

export type ILivePhotoViewSolidProps = ILivePhotoViewProps & {
  /** Gets the handle that starts and stops the playback */
  ref?: (handle: ILivePhotoViewHandle) => void;
};

/** Solid twin of `expo-live-photo`'s `LivePhotoView`, iOS only */
export function LivePhotoView(
  props: ILivePhotoViewSolidProps,
): ISymbioteNode | null {
  const [own, viewProps] = splitProps(props, ['ref']);
  const host = createHostNodeHolder();
  const render = () => {
    const descriptor = renderLivePhotoView({ ...viewProps });
    return descriptor && host.capture(descriptor);
  };
  const initial = render();
  if (!initial) return null;
  own.ref?.(createLivePhotoViewHandle(host.getNode));
  return descriptorToSolid(() => render() ?? initial);
}
