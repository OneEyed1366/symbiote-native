import { createPanelContext } from '../panel';
import { DEFAULT_NESTED_SETTINGS } from './nested-settings';

export const {
  PanelContext: NestedPanelContext,
  injectPanel: injectNestedPanel,
} = createPanelContext(DEFAULT_NESTED_SETTINGS);
