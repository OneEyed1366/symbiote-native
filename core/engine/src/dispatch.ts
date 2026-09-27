// The one place a native event re-enters a framework's update loop: a native event runs its
// listener outside that loop, so the adapter injects a wrapper that runs it at the right priority
// and flushes synchronously. Both Fabric events and device-module events share this seam.

let wrapDispatch: (run: () => void) => void = run => {
  run();
};

export function setEventDispatcher(wrap: (run: () => void) => void): void {
  wrapDispatch = wrap;
}

export function runWrapped(run: () => void): void {
  wrapDispatch(run);
}
