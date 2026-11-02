// Solid `FullWindowOverlay`: core picks the native view and its props, Solid fills it with children

import { untrack } from 'solid-js';
import { Platform, createWindowDimensions } from '@symbiote-native/solid';
import type { JSX } from '@symbiote-native/solid/jsx-runtime';
import { insert } from '@symbiote-native/solid/renderer';
import { resolveFullWindowOverlay } from '../core';
import type { IFullWindowOverlayProps } from '../core';
import { hostElement } from './host';

export type ISolidFullWindowOverlayProps = IFullWindowOverlayProps & {
  children?: JSX.Element;
};

export function FullWindowOverlay(
  props: ISolidFullWindowOverlayProps,
): JSX.Element {
  const dimensions = createWindowDimensions();
  const overlay = () =>
    resolveFullWindowOverlay({
      unstable_accessibilityContainerViewIsModal:
        props.unstable_accessibilityContainerViewIsModal,
      isIOS: Platform.select({ ios: true, default: false }) === true,
      width: dimensions().width,
      height: dimensions().height,
    });
  // The view name depends on the platform alone, so it is read once and only the props are live
  const node = hostElement(
    untrack(() => overlay().viewName),
    () => overlay().props,
  );
  insert(node, () => props.children);
  return node;
}
