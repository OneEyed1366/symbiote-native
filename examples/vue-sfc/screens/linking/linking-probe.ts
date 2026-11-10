import type {
  ILinkingConfig,
  resolveRouteFromUrl,
  resolveUrlFromRoute,
} from '@symbiote-native/navigation';

export type IProbeResult =
  | {
      kind: 'matched';
      name: string;
      params: unknown;
      // The link the route turns back into, null when a param it needs is missing
      backUrl: string | null;
    }
  | { kind: 'unmatched'; reason: 'prefix' | 'screen' };

// The package functions come in as arguments: its barrel pulls native modules into a node run
export type ILinkResolvers = {
  resolve: typeof resolveRouteFromUrl;
  reverse: typeof resolveUrlFromRoute;
};

// A bare path starting with a slash needs no prefix
function hasKnownPrefix(config: ILinkingConfig, url: string): boolean {
  return (
    url.startsWith('/') ||
    config.prefixes.some(prefix => url.startsWith(prefix))
  );
}

export function inspectLink(
  links: ILinkResolvers,
  config: ILinkingConfig,
  url: string,
): IProbeResult {
  const route = links.resolve(config, url);
  if (route === null) {
    return {
      kind: 'unmatched',
      reason: hasKnownPrefix(config, url) ? 'screen' : 'prefix',
    };
  }
  return {
    kind: 'matched',
    name: route.name,
    params: route.params,
    backUrl: links.reverse(config, route),
  };
}

function shellQuote(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

// The commands that hand a link to a booted simulator or a running emulator
export function simulatorCommands(url: string): {
  ios: string;
  android: string;
} {
  const quoted = shellQuote(url);
  return {
    ios: `xcrun simctl openurl booted ${quoted}`,
    android: `adb shell am start -W -a android.intent.action.VIEW -d ${quoted}`,
  };
}
