import type { ReactElement } from 'react';
import { descriptorToReact } from '@symbiote-native/react';
import { renderAppleAuthenticationButton } from '../core/apple-authentication-button';
import type { IAppleAuthenticationButtonProps } from '../core/apple-authentication-button';

/** React twin of `expo-apple-authentication`'s `AppleAuthenticationButton`, iOS only */
export function AppleAuthenticationButton(
  props: IAppleAuthenticationButtonProps & { className?: string },
): ReactElement | null {
  const descriptor = renderAppleAuthenticationButton(props);
  return descriptor ? descriptorToReact(descriptor) : null;
}
