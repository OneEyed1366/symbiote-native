// Base Platform: re-exports the iOS implementation, Metro swaps in the platform file on a device
// The filename is the selector, so there is no `Platform.OS` read here

// TODO(rn-port): stays ours, not RN's `Platform`, for two reasons
// `OS` is picked by file at bundle time and read at module scope in about a dozen places
// A host facade answers only after wiring, which runs after those imports

export * from './index.ios';
