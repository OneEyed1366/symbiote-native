export {
  getCustomTabsSupportingBrowsersAsync,
  warmUpAsync,
  mayInitWithUrlAsync,
  coolDownAsync,
  openBrowserAsync,
  dismissBrowser,
  openAuthSessionAsync,
  dismissAuthSession,
} from './web-browser';
export { WebBrowserResultType, WebBrowserPresentationStyle } from './types';
export type {
  IAuthSessionOpenOptions,
  IRedirectEvent,
  IServiceActionResult,
  IWebBrowserAuthSessionResult,
  IWebBrowserCoolDownResult,
  IWebBrowserCustomTabsResults,
  IWebBrowserDismissResult,
  IWebBrowserMayInitWithUrlResult,
  IWebBrowserOpenOptions,
  IWebBrowserRedirectResult,
  IWebBrowserResult,
  IWebBrowserWarmUpResult,
} from './types';
