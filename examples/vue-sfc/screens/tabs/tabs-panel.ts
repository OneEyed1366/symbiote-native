import { createPanelContext } from '../panel';
import { DEFAULT_TABS_SETTINGS } from './tabs-settings';

export const { PanelContext: TabsPanelContext, usePanel: useTabsPanel } =
  createPanelContext(DEFAULT_TABS_SETTINGS);
