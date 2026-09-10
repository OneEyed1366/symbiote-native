// NativeModules asserts the batched-bridge config at IMPORT time, and Platform.ios reaches
// TurboModuleRegistry.getEnforcing('PlatformConstants') the moment anything pulls processColor.
// Headless there is no binary, so answer by NAME - the shape the adapter tests already use.
const CONSTANTS = {
  getConstants: () => ({
    forceTouchAvailable: false,
    interfaceIdiom: 'phone',
    isTesting: true,
    osVersion: '18.0',
    reactNativeVersion: { major: 0, minor: 86, patch: 0 },
    systemName: 'iOS',
  }),
};
Object.assign(globalThis, {
  __fbBatchedBridgeConfig: { remoteModuleConfig: [] },
  __turboModuleProxy: (name: string) =>
    name === 'PlatformConstants' ? CONSTANTS : null,
});
