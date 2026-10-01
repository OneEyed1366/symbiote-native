// Hermes ships `TextEncoder`, and `@symbiote-native/blob` installs a full `Blob`, but the React
// Native typings declare neither, so the screens that stream bytes would not type check
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

interface Blob {
  text(): Promise<string>;
}
