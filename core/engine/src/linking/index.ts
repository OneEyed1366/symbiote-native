// The runtime is RN's own `Linking`, forwarded through `react-native-host`

export type IUrlEvent = {
  url: string;
};

// Android `sendIntent` extra, RN's `{ key, value }` pair
export type IIntentExtra = {
  key: string;
  value: string | number | boolean;
};
