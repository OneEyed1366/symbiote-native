// React `ScreenContainer`: core picks the native view, the view props go through as they are

import { createElement } from 'react';
import type { ReactElement } from 'react';
import { Platform } from '@symbiote-native/react';
import type { IViewProps } from '@symbiote-native/react';
import { resolveScreenContainerViewName } from '../core';
import type { IScreenContainerProps } from '../core';

export function ScreenContainer(
  props: IViewProps & IScreenContainerProps,
): ReactElement {
  const { enabled, hasTwoStates, ...viewProps } = props;
  const viewName = resolveScreenContainerViewName({
    enabled,
    hasTwoStates,
    os: Platform.OS,
  });
  return createElement(viewName, viewProps);
}
