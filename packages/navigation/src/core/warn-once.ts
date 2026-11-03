// A dev warning printed once per message, like the `warn-once` package screens uses

import { isDevBuild } from '@symbiote-native/engine';

const printedMessages = new Set<string>();

export function warnOnce(isTriggered: boolean, message: string): void {
  if (!isTriggered || !isDevBuild() || printedMessages.has(message)) return;
  printedMessages.add(message);
  console.warn(message);
}
