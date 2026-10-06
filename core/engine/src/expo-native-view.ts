// The Fabric name `requireNativeViewManager` registers: the adapter prefix plus the module name,
// and the app identifier when the host sets one. A module with several views adds the view name
export function expoViewManagerName(
  moduleName: string,
  viewName?: string,
): string {
  const appIdentifier: unknown = Reflect.get(
    Reflect.get(globalThis, 'expo') ?? {},
    '__expo_app_identifier__',
  );
  const suffix =
    typeof appIdentifier === 'string' && appIdentifier !== ''
      ? `_${appIdentifier}`
      : '';
  const named = viewName ? `${moduleName}_${viewName}` : moduleName;
  return `ViewManagerAdapter_${named}${suffix}`;
}

// An Angular template spells a tag statically, so it cannot follow the app identifier suffix
export function warnIfViewNameIsDynamic(
  templateName: string,
  moduleName: string,
  viewName?: string,
): void {
  const actual = expoViewManagerName(moduleName, viewName);
  if (actual === templateName) return;
  console.warn(
    `The view tag "${templateName}" in a template does not match the registered "${actual}", the view will not render`,
  );
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
