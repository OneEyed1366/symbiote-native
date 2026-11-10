import { createPanelContext } from '../panel.svelte';
import { DEFAULT_TABS_SETTINGS } from './tabs-settings';

export const { providePanel: provideTabsPanel, usePanel: useTabsPanel } =
  createPanelContext(DEFAULT_TABS_SETTINGS);
