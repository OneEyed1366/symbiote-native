import { createPanelContext } from '../panel';
import { DEFAULT_DRAWER_SETTINGS } from './drawer-settings';

export const { PanelContext: DrawerPanelContext, usePanel: useDrawerPanel } =
  createPanelContext(DEFAULT_DRAWER_SETTINGS);
