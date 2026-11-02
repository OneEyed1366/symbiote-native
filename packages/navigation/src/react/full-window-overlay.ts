// React `FullWindowOverlay`: core picks the native view and its props, React fills it with children

import { createElement } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, useWindowDimensions } from '@symbiote-native/react';
import { resolveFullWindowOverlay } from '../core';
import type { IFullWindowOverlayProps } from '../core';

export type IReactFullWindowOverlayProps = IFullWindowOverlayProps & {
  children?: ReactNode;
};

export function FullWindowOverlay(
  props: IReactFullWindowOverlayProps,
): ReactElement {
  const { width, height } = useWindowDimensions();
  const overlay = resolveFullWindowOverlay({
    unstable_accessibilityContainerViewIsModal:
      props.unstable_accessibilityContainerViewIsModal,
    isIOS: Platform.select({ ios: true, default: false }) === true,
    width,
    height,
  });
  return createElement(overlay.viewName, overlay.props, props.children);
}
