import { useImperativeHandle, useState } from 'react';
import type { ReactElement, Ref } from 'react';
import { descriptorToReact } from '@symbiote-native/react';
import { createHostNodeHolder } from '@symbiote-native/components';
import { createLivePhotoViewHandle, renderLivePhotoView } from '../core';
import type { ILivePhotoViewHandle, ILivePhotoViewProps } from '../core';

export type ILivePhotoViewReactProps = ILivePhotoViewProps & {
  ref?: Ref<ILivePhotoViewHandle>;
  className?: string;
};

/** React twin of `expo-live-photo`'s `LivePhotoView`, iOS only */
export function LivePhotoView({
  ref,
  ...props
}: ILivePhotoViewReactProps): ReactElement | null {
  const [host] = useState(createHostNodeHolder);
  useImperativeHandle(ref, () => createLivePhotoViewHandle(host.getNode), [
    host,
  ]);
  const descriptor = renderLivePhotoView(props);
  return descriptor ? descriptorToReact(host.capture(descriptor)) : null;
}
