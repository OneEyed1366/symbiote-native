import { UnavailabilityError } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

import { CLIPBOARD_CHANGED_EVENT_NAME, expoClipboard } from './native-module';
import type {
  IClipboardEvent,
  IClipboardImage,
  IGetImageOptions,
  IGetStringOptions,
  ISetStringOptions,
} from './types';

// Matches the module name upstream's own Clipboard.ts passes to every UnavailabilityError.
const NATIVE_MODULE_NAME = 'Clipboard';

/**
 * Gets the content of the user's clipboard.
 *
 * Note: On iOS 16+, if the user denies paste permission, this method returns an empty string.
 * Due to iOS platform limitations, there is no way to distinguish between an empty clipboard
 * and denied permission.
 *
 * @param options Options for the clipboard content to be retrieved.
 * @returns A promise that resolves to the content of the clipboard, or an empty string if the
 * clipboard is empty or permission was denied.
 */
export async function getStringAsync(
  options: IGetStringOptions = {},
): Promise<string> {
  if (!expoClipboard.getStringAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getStringAsync');
  }
  return expoClipboard.getStringAsync(options);
}

/**
 * Sets the content of the user's clipboard.
 *
 * @param text The string to save to the clipboard.
 * @param options Options for the clipboard content to be set.
 * @returns A promise that resolves to `true` once the string has been saved to the clipboard.
 */
export async function setStringAsync(
  text: string,
  options: ISetStringOptions = {},
): Promise<boolean> {
  if (!expoClipboard.setStringAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'setStringAsync');
  }
  return expoClipboard.setStringAsync(text, options);
}

/**
 * Returns whether the clipboard has text content. Returns `true` for both plain text and rich
 * text (e.g. HTML).
 */
// DELIBERATE DIVERGENCE from expo: Clipboard.ts:57 declares this one plain `function`, not
// `async` like its 8 siblings, so on a build without the native method the UnavailabilityError
// escapes synchronously at the call site and `hasStringAsync().catch(handler)` never catches it.
// Parity would hand callers a guard that fires differently from every other method in this API,
// so we add `async` here instead of tagging it. Everything else stays a verbatim port.
export async function hasStringAsync(): Promise<boolean> {
  if (!expoClipboard.hasStringAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'hasStringAsync');
  }
  return expoClipboard.hasStringAsync();
}

/**
 * Gets the URL from the user's clipboard.
 *
 * Note: On iOS 16+, if the user denies paste permission, this method returns `null`. Due to iOS
 * platform limitations, there is no way to distinguish between no URL in clipboard and denied
 * permission.
 * @platform ios
 */
export async function getUrlAsync(): Promise<string | null> {
  if (!expoClipboard.getUrlAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getUrlAsync');
  }
  return expoClipboard.getUrlAsync();
}

/**
 * Sets a URL in the user's clipboard. Behaves the same as `setStringAsync`, except that it sets
 * the clipboard content type to be a URL, letting your app or other apps know that the clipboard
 * contains a URL and behave accordingly.
 * @platform ios
 */
export async function setUrlAsync(url: string): Promise<void> {
  if (!expoClipboard.setUrlAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'setUrlAsync');
  }
  return expoClipboard.setUrlAsync(url);
}

/**
 * Returns whether the clipboard has URL content.
 * @platform ios
 */
export async function hasUrlAsync(): Promise<boolean> {
  if (!expoClipboard.hasUrlAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'hasUrlAsync');
  }
  return expoClipboard.hasUrlAsync();
}

/**
 * Gets the image from the user's clipboard and returns it in the specified format.
 *
 * Note: On iOS 16+, if the user denies paste permission, this method returns `null`. Due to iOS
 * platform limitations, there is no way to distinguish between no image in clipboard and denied
 * permission.
 *
 * @param options Specifies the desired format of the image.
 * @returns If there was an image in the clipboard, resolves to an `IClipboardImage` object
 * containing the base64 string and metadata of the image. Otherwise resolves to `null` (this
 * includes cases where permission was denied).
 */
export async function getImageAsync(
  options: IGetImageOptions,
): Promise<IClipboardImage | null> {
  if (!expoClipboard.getImageAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getImageAsync');
  }
  return expoClipboard.getImageAsync(options);
}

/**
 * Sets an image in the user's clipboard.
 *
 * @param base64Image Image encoded as a base64 string, without MIME type.
 */
export async function setImageAsync(base64Image: string): Promise<void> {
  if (!expoClipboard.setImageAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'setImageAsync');
  }
  return expoClipboard.setImageAsync(base64Image);
}

/**
 * Returns whether the clipboard has image content.
 */
export async function hasImageAsync(): Promise<boolean> {
  if (!expoClipboard.hasImageAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'hasImageAsync');
  }
  return expoClipboard.hasImageAsync();
}

/**
 * Adds a listener that fires whenever the content of the user's clipboard changes. Kept here at
 * the core level, framework-agnostic, exactly like `Accelerometer.addListener` lives in
 * `@symbiote-native/sensors`' core — each adapter's `useClipboard` hook/composable/service wraps
 * this in its own mount/unmount lifecycle rather than reimplementing the subscription.
 *
 * @param listener Callback invoked with an `IClipboardEvent` describing the new clipboard
 * content types whenever the clipboard changes.
 */
export function addClipboardListener(
  listener: (event: IClipboardEvent) => void,
): EventSubscription {
  return expoClipboard.addListener(CLIPBOARD_CHANGED_EVENT_NAME, listener);
}

/**
 * Removes the listener added by `addClipboardListener`.
 * @deprecated use `subscription.remove()` instead.
 */
export function removeClipboardListener(subscription: EventSubscription): void {
  subscription.remove();
}
