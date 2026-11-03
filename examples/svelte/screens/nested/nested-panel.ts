import { createPanelContext } from '../panel.svelte';
import { DEFAULT_NESTED_SETTINGS } from './nested-settings';

export const { providePanel: provideNestedPanel, usePanel: useNestedPanel } =
  createPanelContext(DEFAULT_NESTED_SETTINGS);
