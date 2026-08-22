// useLinkingIntegration: wires the framework-agnostic linking config (../core's
// resolveRouteFromUrl) onto an existing Stack's INavigatorHandle. Deliberately NOT called from
// inside stack/index.svelte - app code owns the wiring, the same top-level-prop shape
// @react-navigation keeps `linking` in on NavigationContainer rather than baking it into the
// router itself.
//
// Svelte-shape difference from React and Vue: React's twin takes the RESOLVED
// `navigatorHandle: INavigatorHandle` (a React hook re-runs on every render with the caller's
// current value); Vue's takes the `Ref` object and reads `.value` inside onMounted. A Svelte
// component's script runs exactly ONCE and its `bind:this` target is only assigned during mount,
// so this takes a GETTER - the boxed-getter convention this adapter uses everywhere - and reads
// it INSIDE the effect, i.e. after mount. The read is deliberately TRACKED (no `untrack`, unlike
// the ./runes files): when the app declares its handle with `$state.raw`, the effect re-runs the
// moment `bind:this` lands, so the wiring never depends on a mount-ordering guarantee at all.
// Re-running is safe because the previous run's cleanup tears the subscription down first.
//
// `.svelte.ts`: `$effect` is only usable outside a component in a file with this extension.

import { Linking, dlog } from '@symbiote-native/engine';
import type { IEventSubscription, IUrlEvent } from '@symbiote-native/engine';
import { resolveRouteFromUrl } from '../core';
import type { ILinkingConfig, INavigatorHandle } from '../core';

export function useLinkingIntegration(
  config: ILinkingConfig,
  getNavigatorHandle: () => INavigatorHandle | null,
): void {
  $effect(() => {
    const handle = getNavigatorHandle();
    if (handle === null) {
      dlog('useLinkingIntegration: navigatorHandle is not available yet');
      return;
    }

    let cancelled = false;

    const applyRoute = (
      url: string,
      dispatch: (name: string, params?: unknown) => void,
    ): void => {
      const route = resolveRouteFromUrl(config, url);
      if (route === null) {
        dlog(`useLinkingIntegration: no route resolved for "${url}"`);
        return;
      }
      dispatch(route.name, route.params);
    };

    Linking.getInitialURL()
      .then(url => {
        if (cancelled || url === null) return;
        dlog(`useLinkingIntegration: initial URL "${url}"`);
        applyRoute(url, handle.replace);
      })
      .catch((error: unknown) => {
        dlog(`useLinkingIntegration: getInitialURL failed: ${String(error)}`);
      });

    const subscription: IEventSubscription = Linking.addEventListener(
      'url',
      (event: IUrlEvent) => {
        dlog(`useLinkingIntegration: url event "${event.url}"`);
        applyRoute(event.url, handle.push);
      },
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  });
}
