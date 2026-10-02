import { descriptorToSolid } from '@symbiote-native/solid';
import {
  isContactAccessButtonAvailable,
  renderContactAccessButton,
} from '../core/contact-access-button';
import type { IContactAccessButtonProps } from '../core/contact-access-button';

// The platform decision is made once at mount: the descriptor bridge builds the node once and
// only diffs prop values afterwards, so the descriptor's shape must not change
function ContactAccessButtonView(
  props: IContactAccessButtonProps,
): ReturnType<typeof descriptorToSolid> | null {
  const initial = renderContactAccessButton({ ...props });
  if (!initial) return null;
  return descriptorToSolid(
    () => renderContactAccessButton({ ...props }) ?? initial,
  );
}

/** Solid twin of `expo-contacts`' `ContactAccessButton`, iOS 18+ only, nothing elsewhere */
export const ContactAccessButton = Object.assign(ContactAccessButtonView, {
  /** True only on iOS 18.0 and newer */
  isAvailable: isContactAccessButtonAvailable,
});
