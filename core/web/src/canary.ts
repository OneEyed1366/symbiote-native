// The one screen every adapter renders on a page in its parity test, and the facts it must leave
// there. Each adapter writes the tree in its own idiom, so the proof is in what the page holds

import {
  disposeRoot,
  type IAppRegistry,
  type IRootTag,
} from '@symbiote-native/engine';
import { elementByTestId, settle } from './interactions';
import { runAppOnWeb, type IWebAppRegistry } from './run-on-web';

export type ICanaryFacts = {
  appTag: string;
  greetingTag: string;
  boldTag: string;
  greetingText: string;
  background: string;
  padding: string;
  boldWeight: string;
};

export const CANARY_BOX_STYLE = { padding: 8, backgroundColor: 'red' };
export const CANARY_BOLD_STYLE = { fontWeight: 'bold' } as const;

// A text inside a text is a span, a view and a text are blocks
export const CANARY_FACTS: ICanaryFacts = {
  appTag: 'DIV',
  greetingTag: 'DIV',
  boldTag: 'SPAN',
  greetingText: 'hello web',
  background: 'red',
  padding: '8px',
  boldWeight: 'bold',
};

const APP_KEY = 'canary';
const ROOT_ID = 'root';
// Each adapter installs it to stop a surface, the registry has no host to route the unmount to here
const STOP_SURFACE = 'RN$stopSurface';

type ILiveCanary = {
  container: HTMLElement | undefined;
  tags: IRootTag[];
  // Each stops one running app, so its timers and renders do not reach the next test's page
  unmounts: (() => void)[];
};

// What a test needs to run an app and to take it down again
type ICanaryRegistry<TProvider> = IWebAppRegistry<TProvider> &
  Pick<
    IAppRegistry<TProvider, unknown>,
    'unmountApplicationComponentAtRootTag'
  >;

// The page and the surfaces the last render made, so a test can clear both
const live: ILiveCanary = { container: undefined, tags: [], unmounts: [] };

function readFacts(root: HTMLElement): ICanaryFacts {
  const app = elementByTestId(root, 'app');
  const greeting = elementByTestId(root, 'greeting');
  const bold = elementByTestId(root, 'bold');
  return {
    appTag: app.tagName,
    greetingTag: greeting.tagName,
    boldTag: bold.tagName,
    greetingText: greeting.textContent,
    background: app.style.backgroundColor,
    padding: app.style.padding,
    boldWeight: bold.style.fontWeight,
  };
}

// An adapter finishes an unmount on a turn of its own, so the surface goes only after it
export async function disposeCanary(): Promise<void> {
  live.container?.remove();
  live.container = undefined;
  for (const unmount of live.unmounts.splice(0)) unmount();
  await settle();
  for (const tag of live.tags.splice(0)) disposeRoot(tag);
}

// Some adapters commit on a microtask, so the page is read one tick after the app ran
export async function mountOnWeb<TProvider>(
  registry: ICanaryRegistry<TProvider>,
  provider: TProvider,
): Promise<HTMLElement> {
  await disposeCanary();
  const container = document.createElement('div');
  container.id = ROOT_ID;
  document.body.appendChild(container);
  live.container = container;
  runAppOnWeb(
    {
      registerComponent: (appKey, next) =>
        registry.registerComponent(appKey, next),
      runApplication: (appKey, params) => {
        live.tags.push(params.rootTag);
        live.unmounts.push(() => {
          registry.unmountApplicationComponentAtRootTag(params.rootTag);
          const stopSurface: unknown = Reflect.get(globalThis, STOP_SURFACE);
          if (typeof stopSurface === 'function') stopSurface(params.rootTag);
        });
        registry.runApplication(appKey, params);
      },
    },
    APP_KEY,
    provider,
    { container },
  );
  await settle();
  return container;
}

export async function renderCanaryOnWeb<TProvider>(
  registry: ICanaryRegistry<TProvider>,
  provider: TProvider,
): Promise<ICanaryFacts> {
  return readFacts(await mountOnWeb(registry, provider));
}
