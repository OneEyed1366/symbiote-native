// What a test sent to a native module through RN's `TurboModuleRegistry`, which vitest.config.ts
// stubs and records into `globalThis.__symbioteNativeCalls`

type INativeCall = { module: string; method: string; args: unknown[] };

function isNativeCall(value: unknown): value is INativeCall {
  return (
    typeof value === 'object' &&
    value !== null &&
    'module' in value &&
    'method' in value &&
    'args' in value
  );
}

export function nativeCallsTo(moduleName: string): INativeCall[] {
  const recorded: unknown = Reflect.get(globalThis, '__symbioteNativeCalls');
  if (!Array.isArray(recorded)) return [];
  return recorded
    .filter(isNativeCall)
    .filter(call => call.module === moduleName);
}
