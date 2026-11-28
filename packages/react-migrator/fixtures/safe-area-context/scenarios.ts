// What upstream paints per scenario, read by the upstream React test and by every port's test
export const SAFE_AREA_SCREEN = {
  mounted: '#surface(RNCSafeAreaProvider(RCTText(RCTRawText "top=47 w=390")))',
  afterInsetsEvent: '#surface(RNCSafeAreaProvider(RCTText(RCTRawText "top=59 w=430")))',
  afterFramelessEvent: '#surface(RNCSafeAreaProvider(RCTText(RCTRawText "top=59 w=390")))',
  nested:
    '#surface(RNCSafeAreaProvider(RNCSafeAreaProvider(RCTText(RCTRawText "top=47 w=390"))))',
} as const;
