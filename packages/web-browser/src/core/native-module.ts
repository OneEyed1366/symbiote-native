import { requireNativeModule } from 'expo-modules-core';
import type {
  IProcessedOpenOptions,
  IWebBrowserAuthSessionResult,
  IWebBrowserCoolDownResult,
  IWebBrowserCustomTabsResults,
  IWebBrowserDismissResult,
  IWebBrowserMayInitWithUrlResult,
  IWebBrowserResult,
  IWebBrowserWarmUpResult,
} from './types';

const EXPO_WEB_BROWSER_MODULE_NAME = 'ExpoWebBrowser';

// Every member is optional — the two platforms register genuinely different sets, so each call
// site checks for presence and throws an UnavailabilityError itself rather than assuming the
// whole surface exists:
//   iOS   — openBrowserAsync, dismissBrowser, openAuthSessionAsync, dismissAuthSession, plus
//           no-op warmUpAsync/coolDownAsync/mayInitWithUrlAsync stubs.
//   Android — openBrowserAsync, warmUpAsync, coolDownAsync, mayInitWithUrlAsync,
//           getCustomTabsSupportingBrowsersAsync. There is no way to dismiss a Custom Tab and no
//           native auth session; the user has to press the tab's own close button.
export type INativeWebBrowserModule = {
  openBrowserAsync?(
    url: string,
    options: IProcessedOpenOptions,
  ): Promise<IWebBrowserResult>;
  dismissBrowser?(): Promise<IWebBrowserDismissResult>;
  openAuthSessionAsync?(
    url: string,
    redirectUrl: string | null | undefined,
    options: IProcessedOpenOptions,
  ): Promise<IWebBrowserAuthSessionResult>;
  dismissAuthSession?(): void;
  warmUpAsync?(browserPackage?: string): Promise<IWebBrowserWarmUpResult>;
  coolDownAsync?(browserPackage?: string): Promise<IWebBrowserCoolDownResult>;
  mayInitWithUrlAsync?(
    url: string,
    browserPackage?: string,
  ): Promise<IWebBrowserMayInitWithUrlResult>;
  getCustomTabsSupportingBrowsersAsync?(): Promise<IWebBrowserCustomTabsResults>;
};

export const expoWebBrowser = requireNativeModule<INativeWebBrowserModule>(
  EXPO_WEB_BROWSER_MODULE_NAME,
);
