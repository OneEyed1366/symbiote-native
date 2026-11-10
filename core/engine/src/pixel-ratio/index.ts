// The runtime is RN's own `PixelRatio`, forwarded through `react-native-host`

export type IPixelRatioStatic = {
  get(): number;
  getFontScale(): number;
  getPixelSizeForLayoutSize(layoutSize: number): number;
  roundToNearestPixel(layoutSize: number): number;
  startDetecting(): void;
};
