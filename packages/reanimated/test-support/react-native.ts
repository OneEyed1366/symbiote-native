// What Reanimated reads from `react-native` at runtime, enough for its JS-thread code to load

type IPlatformSelect<T> = { ios?: T; android?: T; native?: T; default?: T };

export const Platform = {
  OS: 'ios',
  select: <T>(spec: IPlatformSelect<T>): T | undefined =>
    spec.ios ?? spec.native ?? spec.default,
};

export const StyleSheet = {
  create: <T>(styles: T): T => styles,
  flatten: <T>(style: T): T => style,
  hairlineWidth: 1,
};

export const TurboModuleRegistry = {
  get: (): null => null,
  getEnforcing: (): never => {
    throw new Error('no native module in a headless test');
  },
};

export const findNodeHandle = (): null => null;
export const codegenNativeComponent = (name: string): string => name;

// The components the upstream root wraps when it loads; nothing renders them here
function hostComponent(name: string) {
  const component = () => null;
  component.displayName = name;
  return component;
}

export const View = hostComponent('View');
export const Text = hostComponent('Text');
export const Image = hostComponent('Image');
export const ScrollView = hostComponent('ScrollView');
export const FlatList = hostComponent('FlatList');
export const TextInput = hostComponent('TextInput');
