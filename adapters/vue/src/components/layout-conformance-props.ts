// The prop surface of `<layout-conformance>`, RN's `experimental_LayoutConformance`, for Vue
// Children come through the default slot, so there is no `children` here
import type { ILayoutConformanceMode } from '@symbiote-native/components';

export type ILayoutConformanceProps = {
  // `strict` lays out by the W3C spec even where it breaks compatibility
  mode: ILayoutConformanceMode;
};
