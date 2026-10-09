// The runtime is RN's own `DevSettings`, forwarded through `react-native-host`

export type IDevSettings = {
  // The title is the id of the item, so it must be unique
  addMenuItem(title: string, handler: () => unknown): void;
  reload(reason?: string): void;
  onFastRefresh(): void;
};
