import { expoViewManagerName, tryRegisterNativeView } from './expo-native-view';

export type IExpoNativeView = {
  /** The Fabric name `requireNativeViewManager` registers for this view */
  name: () => string;
  /** Registers the view config, false when the native module lacks it */
  ensureRegistered: () => boolean;
};

type IRequireManager = (moduleName: string, viewName?: string) => unknown;

// A module with several views, one handle per key of `viewNames`
export function defineExpoNativeViews<K extends string>(
  requireManager: IRequireManager,
  moduleName: string,
  viewNames: Readonly<Record<K, string>>,
): Record<K, IExpoNativeView> {
  const entries = Object.entries<string>(viewNames).map(([key, viewName]) => [
    key,
    defineExpoNativeView(requireManager, moduleName, viewName),
  ]);
  return Object.fromEntries(entries);
}

// The package passes its own `requireNativeViewManager`, the engine does not depend on expo
export function defineExpoNativeView(
  requireManager: IRequireManager,
  moduleName: string,
  viewName?: string,
): IExpoNativeView {
  return {
    name: () => expoViewManagerName(moduleName, viewName),
    ensureRegistered: () =>
      tryRegisterNativeView(() =>
        viewName === undefined
          ? requireManager(moduleName)
          : requireManager(moduleName, viewName),
      ),
  };
}
