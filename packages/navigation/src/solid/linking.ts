// createLinkingIntegration: wires the framework-agnostic linking config (../core's
// resolveRouteFromUrl) onto an existing Stack's INavigatorHandle. Deliberately NOT called from
// inside ./stack - app code owns the wiring, the same top-level-prop shape @react-navigation keeps
// `linking` in on NavigationContainer rather than baking it into the router itself.
//
// `create*`, not `use*`: it owns a Linking subscription and its teardown. (Vue and Svelte spell it
// `useLinkingIntegration` because their ecosystems put every lifecycle helper behind `use`; Solid
// reserves that prefix for consuming something that already exists -
// <adapter_src_follows_framework_idioms>.)
//
// Takes an ACCESSOR of the handle, not the handle: `<Stack ref={setHandle}>` resolves after the
// navigator has been created, so an eagerly-passed value would be `null` at the call site. Reading
// it lazily inside onMount gives the same "already populated" guarantee React's layout-effect
// ordering does - a Solid `ref` on a component is called during that component's own creation,
// which is strictly before any effect runs.

import { onCleanup, onMount } from 'solid-js';
import type { Accessor } from 'solid-js';
import { Linking, dlog } from '@symbiote-native/engine';
import type { IEventSubscription, IUrlEvent } from '@symbiote-native/engine';
import { resolveRouteFromUrl } from '../core';
import type { ILinkingConfig, INavigatorHandle } from '../core';

export function createLinkingIntegration(
  config: ILinkingConfig,
  navigatorHandle: Accessor<INavigatorHandle | null>,
): void {
  let cancelled = false;
  let subscription: IEventSubscription | undefined;

  function applyRoute(
    url: string,
    dispatch: (name: string, params?: unknown) => void,
  ): void {
    const route = resolveRouteFromUrl(config, url);
    if (route === null) {
      dlog(`createLinkingIntegration: no route resolved for "${url}"`);
      return;
    }
    dispatch(route.name, route.params);
  }

  onMount(() => {
    const handle = navigatorHandle();
    if (handle === null) {
      dlog(
        'createLinkingIntegration: navigatorHandle is not yet available at mount time',
      );
      return;
    }

    Linking.getInitialURL()
      .then(url => {
        if (cancelled || url === null) return;
        dlog(`createLinkingIntegration: initial URL "${url}"`);
        applyRoute(url, handle.replace);
      })
      .catch((error: unknown) => {
        dlog(
          `createLinkingIntegration: getInitialURL failed: ${String(error)}`,
        );
      });

    subscription = Linking.addEventListener('url', (event: IUrlEvent) => {
      dlog(`createLinkingIntegration: url event "${event.url}"`);
      applyRoute(event.url, handle.push);
    });
  });

  onCleanup(() => {
    cancelled = true;
    subscription?.remove();
  });
}
