// The prop surface of `<layout-conformance>`, RN's `experimental_LayoutConformance`, for Angular
// Children come through `<ng-content>`, so there is no `children` here
import type { ILayoutConformanceMode } from '@symbiote-native/components';

export type IAngularLayoutConformanceProps = {
  // `strict` lays out by the W3C spec even where it breaks compatibility
  mode: ILayoutConformanceMode;
};
