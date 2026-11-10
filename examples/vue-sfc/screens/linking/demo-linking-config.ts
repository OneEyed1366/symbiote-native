import type { ILinkingConfig } from '@symbiote-native/navigation';

// Not the config of the app: it holds what the app config does not, to try every matching rule
export const DEMO_LINKING_CONFIG: ILinkingConfig = {
  prefixes: ['demo://', 'https://demo.example'],
  config: {
    screens: {
      Profile: 'user/:id',
      Me: 'user/me',
      Settings: {
        path: 'settings',
        screens: {
          Privacy: 'privacy',
          Account: 'account/:tab',
        },
      },
    },
  },
};
