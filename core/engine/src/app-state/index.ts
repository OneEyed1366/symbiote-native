// The runtime is RN's own `AppState`, forwarded through `react-native-host`

export type IAppStateStatus =
  'inactive' | 'background' | 'active' | 'extension' | 'unknown';
export type IAppStateEvent = 'change' | 'memoryWarning' | 'focus' | 'blur';
