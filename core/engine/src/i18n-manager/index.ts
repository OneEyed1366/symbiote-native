// The runtime is RN's own `I18nManager`, forwarded through `react-native-host`

export type II18nManagerConstants = {
  isRTL: boolean;
  doLeftAndRightSwapInRTL: boolean;
  localeIdentifier?: string;
};
