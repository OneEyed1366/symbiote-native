import { createPanelContext } from '../panel';
import { DEFAULT_NESTED_SETTINGS } from './nested-settings';

export const { PanelContext: NestedPanelContext, usePanel: useNestedPanel } =
  createPanelContext(DEFAULT_NESTED_SETTINGS);
