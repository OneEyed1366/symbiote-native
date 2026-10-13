import * as clack from '@clack/prompts';

// clack resolves a cancelled prompt (Ctrl+C) to its own sentinel symbol instead of rejecting
// An assertion function narrows that symbol away at each call site with no `as` cast
// A boolean helper could not, as its narrowing cannot cross back into the caller's `answer`
export function assertNotCancelled<TValue>(
  answer: TValue | symbol,
): asserts answer is TValue {
  if (clack.isCancel(answer)) {
    clack.cancel('Cancelled.');
    process.exit(1);
  }
}

// Piped stdin (CI, a Docker build, `... | npx @symbiote-native/cli new`) is not a real terminal
// A clack prompt reading from it hangs forever, so each resolver checks this before it asks
export function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}
