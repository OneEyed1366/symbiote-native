// The prop surface of `<layout-conformance>`, RN's `experimental_LayoutConformance`, for React
// `children` is a `ReactNode`, which keeps the type per adapter
import type { ReactNode } from 'react';
import type { ILayoutConformanceMode } from '@symbiote-native/components';

export type ILayoutConformanceProps = {
  // `strict` lays out by the W3C spec even where it breaks compatibility
  mode: ILayoutConformanceMode;
  children?: ReactNode;
};
