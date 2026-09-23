// RN's `invariant(condition, message)` (the `invariant` package): a synchronous throw named
// 'Invariant Violation' carrying the message verbatim. Ports use it where RN does, so a failure is
// the same exception at the same moment.
export function invariant(
  condition: boolean,
  message: string,
): asserts condition {
  if (condition) return;
  const error = new Error(message);
  error.name = 'Invariant Violation';
  throw error;
}
