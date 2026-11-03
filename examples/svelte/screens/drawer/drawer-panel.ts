import { createPanelContext } from '../panel.svelte';
import { DEFAULT_DRAWER_SETTINGS } from './drawer-settings';

export const { providePanel: provideDrawerPanel, usePanel: useDrawerPanel } =
  createPanelContext(DEFAULT_DRAWER_SETTINGS);
