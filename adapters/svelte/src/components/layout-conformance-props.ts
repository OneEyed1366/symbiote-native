// The prop surface of `<layout-conformance>`, RN's `experimental_LayoutConformance`, for Svelte
// `children` is a `Snippet`, which keeps the type per adapter
import type { Snippet } from 'svelte';
import type { ILayoutConformanceMode } from '@symbiote-native/components';

export type ILayoutConformanceProps = {
  // `strict` lays out by the W3C spec even where it breaks compatibility
  mode: ILayoutConformanceMode;
  children?: Snippet;
};
