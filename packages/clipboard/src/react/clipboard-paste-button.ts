import type { ReactElement } from 'react';
import { descriptorToReact } from '@symbiote-native/react';
import { renderClipboardPasteButton } from '../core/clipboard-paste-button';
import type { IClipboardPasteButtonProps } from '../core/clipboard-paste-button';

/** React twin of `expo-clipboard`'s `ClipboardPasteButton` (`UIPasteControl`), iOS only */
export function ClipboardPasteButton(
  props: IClipboardPasteButtonProps,
): ReactElement | null {
  const descriptor = renderClipboardPasteButton(props);
  return descriptor ? descriptorToReact(descriptor) : null;
}
