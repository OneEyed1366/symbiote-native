// React `ScreenFooter`: the native footer view of a `formSheet`, view props go through as they are

import { createElement } from 'react';
import type { ReactElement } from 'react';
import type { IViewProps } from '@symbiote-native/react';
import { RNS_SCREEN_FOOTER_VIEW_NAME } from '../core';

export function ScreenFooter(props: IViewProps): ReactElement {
  return createElement(RNS_SCREEN_FOOTER_VIEW_NAME, props);
}
