import { isContactAccessButtonAvailable } from '../core/contact-access-button';
import ContactAccessButtonView from './contact-access-button.svelte';

export * from '../core';

/** Svelte twin of `expo-contacts`' `ContactAccessButton`, iOS 18+ only, nothing elsewhere */
export const ContactAccessButton = Object.assign(ContactAccessButtonView, {
  /** True only on iOS 18.0 and newer */
  isAvailable: isContactAccessButtonAvailable,
});
