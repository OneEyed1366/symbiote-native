import { expoMailComposer } from './native-module';
import type {
  IMailClient,
  IMailComposerOptions,
  IMailComposerResult,
} from './types';

/** Mail clients installed on the device — present as choices, or open one to check a reply. */
export function getClients(): IMailClient[] {
  return expoMailComposer.getClients();
}

/** Opens a mail modal (iOS) / chooser (Android). Android always resolves `{ status: 'sent' }`. */
export async function composeAsync(
  options: IMailComposerOptions,
): Promise<IMailComposerResult> {
  return expoMailComposer.composeAsync(options);
}

/** Whether `composeAsync` can be used — `false` on iOS under an MDM outgoing-mail block. */
export async function isAvailableAsync(): Promise<boolean> {
  return expoMailComposer.isAvailableAsync();
}
