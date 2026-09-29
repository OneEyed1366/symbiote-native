// The Fabric name `requireNativeViewManager` registers: the adapter prefix plus the module name,
// and the app identifier when the host sets one
export function expoViewManagerName(moduleName: string): string {
  const appIdentifier: unknown = Reflect.get(
    Reflect.get(globalThis, 'expo') ?? {},
    '__expo_app_identifier__',
  );
  const suffix =
    typeof appIdentifier === 'string' && appIdentifier !== ''
      ? `_${appIdentifier}`
      : '';
  return `ViewManagerAdapter_${moduleName}${suffix}`;
}

// A missing view config must not crash the render, the view just renders nothing
export function tryRegisterNativeView(register: () => unknown): boolean {
  try {
    register();
    return true;
  } catch {
    return false;
  }
}
