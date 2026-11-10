// The prop surface of `<layout-conformance>`, RN's `experimental_LayoutConformance`, for Solid
// `children` is a Solid `JSX.Element`, which keeps the type per adapter
import type { ILayoutConformanceMode } from '@symbiote-native/components';
import type { JSX } from '../jsx-runtime';

export type ILayoutConformanceProps = {
  // `strict` lays out by the W3C spec even where it breaks compatibility
  mode: ILayoutConformanceMode;
  children?: JSX.Element;
};
