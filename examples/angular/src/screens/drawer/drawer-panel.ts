import { createPanelContext } from '../panel';
import { DEFAULT_DRAWER_SETTINGS } from './drawer-settings';

export const {
  panelProvider: drawerPanelProvider,
  injectPanel: injectDrawerPanel,
} = createPanelContext(DEFAULT_DRAWER_SETTINGS);
