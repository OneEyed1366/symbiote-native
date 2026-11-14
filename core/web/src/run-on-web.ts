// What an adapter's web entry calls once its app is registered. The adapter supplies how to run
// the app on a root tag, this finds the page element and boots the host under it

import type { IAppRegistry, IRootTag } from '@symbiote-native/engine';
import { bootWebHost } from './boot';

export type IRunOnWebOptions = {
  // Defaults to the element with the id `root`, which Expo's HTML shell provides
  container?: HTMLElement;
  document?: Document;
};

// The two calls of an adapter's registry that an app start needs, whatever its component type is
export type IWebAppRegistry<TProvider> = Pick<
  IAppRegistry<TProvider, unknown>,
  'registerComponent' | 'runApplication'
>;

const ROOT_ID = 'root';
const LOADING = 'loading';

export function runOnWeb(
  run: (rootTag: IRootTag) => void,
  options: IRunOnWebOptions = {},
): void {
  const page = options.document ?? document;
  const start = (): void => {
    const container = options.container ?? page.getElementById(ROOT_ID);
    if (container === null) {
      throw new Error(`no #${ROOT_ID} element on the page to render into`);
    }
    run(bootWebHost({ document: page, container }).rootTag);
  };
  if (options.container === undefined && page.readyState === LOADING) {
    page.addEventListener('DOMContentLoaded', start, { once: true });
    return;
  }
  start();
}

// Registers the app and runs it, as RN's host does for a native surface
export function runAppOnWeb<TProvider>(
  registry: IWebAppRegistry<TProvider>,
  appName: string,
  provider: TProvider,
  options: IRunOnWebOptions = {},
): void {
  registry.registerComponent(appName, provider);
  runOnWeb(rootTag => registry.runApplication(appName, { rootTag }), options);
}
