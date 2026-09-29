import type { ReactElement } from 'react';
import { descriptorToReact } from '@symbiote-native/react';
import {
  isContactAccessButtonAvailable,
  renderContactAccessButton,
} from '../core/contact-access-button';
import type { IContactAccessButtonProps } from '../core/contact-access-button';

function ContactAccessButtonView(
  props: IContactAccessButtonProps,
): ReactElement | null {
  const descriptor = renderContactAccessButton(props);
  return descriptor ? descriptorToReact(descriptor) : null;
}

/** React twin of `expo-contacts`' `ContactAccessButton`, iOS 18+ only, nothing elsewhere */
export const ContactAccessButton = Object.assign(ContactAccessButtonView, {
  /** True only on iOS 18.0 and newer */
  isAvailable: isContactAccessButtonAvailable,
});
