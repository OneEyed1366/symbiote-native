import { createPanelContext } from '../panel';
import { DEFAULT_TABS_SETTINGS } from './tabs-settings';

export const {
  panelProvider: tabsPanelProvider,
  injectPanel: injectTabsPanel,
} = createPanelContext(DEFAULT_TABS_SETTINGS);
