// The bundle resolves the web files of Reanimated, as the package tests under vitest do, and those
// take `window` for a browser. The prelude of the runner defines it, so it is taken away first
Reflect.deleteProperty(globalThis, 'window');
