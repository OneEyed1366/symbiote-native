// Thrown for a malformed invocation (unknown command/flag, invalid or missing flag value) —
// caught in index.ts and printed as a one-line usage message, no stack trace.
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

// Thrown by `add`'s eligibility guard when the current directory's package.json declares no
// @symbiote-native/<adapter> dependency at all — `add` only extends an EXISTING symbiote app with
// more of the same optional layers `new` offers; it does not bootstrap symbiote into a plain RN
// project (that would require touching native files it has no safe, idempotent way to reconcile
// against real, already-customized project state — see `new` for scaffolding one from scratch).
export class NotSymbioteAppError extends Error {
  constructor() {
    super(
      'No @symbiote-native/<adapter> dependency found in this project\'s package.json — "add" only ' +
        'works inside an existing @symbiote-native/* app. Run "@symbiote-native/cli new" to scaffold one.',
    );
    this.name = 'NotSymbioteAppError';
  }
}
