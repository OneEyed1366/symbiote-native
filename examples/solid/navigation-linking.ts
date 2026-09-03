// Shared deep-linking config: one ILinkingConfig used BOTH by the root wiring (App.tsx's
// createLinkingIntegration, for real OS deep links) and, once that screen lands, by the DeepLinking
// demo's direct resolveRouteFromUrl call against a typed-in URL — a single source of truth so the
// two can never resolve the same URL differently.
//
// The prefix is deliberately distinct from the React (`symbiotecanary://`), Vue SFC
// (`symbiotecanaryvuesfc://`) and Svelte (`symbiotecanarysvelte://`) ports: each canary is a
// separate installed app on a real device, and a shared scheme would route a deep link to whichever
// one the OS resolved last.
//
// The mapped routes are registered later, as their screens land — a config entry for a route with
// no <Stack.Screen> marker simply never resolves, it does not break the navigator.

import type { ILinkingConfig } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from './routes';

export const APP_LINKING_CONFIG: ILinkingConfig = {
  prefixes: ['symbiotecanarysolid://', 'https://canary.symbiote-native.dev'],
  config: {
    screens: {
      [ROUTE_NAME.Details]: 'details/:id',
      [ROUTE_NAME.HeaderOptions]: 'header-options',
      [ROUTE_NAME.TabsDemo]: 'tabs',
    },
  },
};

export const SAMPLE_DEEP_LINK_URL = 'symbiotecanarysolid://details/42';
