import { descriptorToSolid } from '@symbiote-native/solid';
import { renderClipboardPasteButton } from '../core/clipboard-paste-button';
import type { IClipboardPasteButtonProps } from '../core/clipboard-paste-button';

// The platform decision is made once at mount: the descriptor bridge builds the node once and
// only diffs prop values afterwards, so the descriptor's shape must not change
export function ClipboardPasteButton(
  props: IClipboardPasteButtonProps,
): ReturnType<typeof descriptorToSolid> | null {
  const initial = renderClipboardPasteButton({ ...props });
  if (!initial) return null;
  return descriptorToSolid(
    () => renderClipboardPasteButton({ ...props }) ?? initial,
  );
}
