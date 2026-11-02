import {
  useNavigationState,
  useRoute,
} from '@symbiote-native/navigation/svelte';
import { ROUTE_NAME } from '../../routes';
import { useRouteSettings } from '../use-route-settings.svelte';
import {
  canPushProbe,
  pushProbeParams,
  readPanel,
  readProbe,
  resetStateOf,
  timedPanelOf,
} from './probe';

// The panel of this screen and the stack calls it makes, a probe is this same route pushed again
export function useProbe() {
  const route = useRoute();
  const routeSettings = useRouteSettings(readPanel);
  const { navigation, update } = routeSettings;
  const probe = $derived(readProbe(route.current.params));
  const stackSize = useNavigationState(state => state.routes.length);
  const canPush = $derived(canPushProbe(routeSettings.settings));
  const here = () => ({
    depth: probe.depth,
    anchorKey: probe.anchorKey,
    routeKey: route.current.key,
  });
  const actions = {
    pushProbe: () => {
      if (!canPush) return;
      navigation.current.push(
        ROUTE_NAME.StackTransitions,
        pushProbeParams(routeSettings.settings, here()),
      );
    },
    // The duration only shows on some animations, so this one picks one that obeys it
    pushTimedProbe: () => {
      if (!canPush) return;
      navigation.current.push(
        ROUTE_NAME.StackTransitions,
        pushProbeParams(timedPanelOf(routeSettings.settings), here()),
      );
    },
    // A replacement keeps the depth of the probe it replaces
    replaceWithProbe: () => {
      if (!canPush) return;
      navigation.current.replace(
        ROUTE_NAME.StackTransitions,
        pushProbeParams(routeSettings.settings, {
          ...here(),
          depth: probe.depth - 1,
        }),
      );
    },
    pop: () => navigation.current.pop(Number(routeSettings.settings.popCount)),
    popToTop: () => navigation.current.popToTop(),
    popToAnchor: () => {
      const { anchorKey } = probe;
      if (anchorKey !== undefined) navigation.current.popTo(anchorKey);
    },
    reset: () => {
      if (canPush) {
        navigation.current.reset(
          resetStateOf(routeSettings.settings, Date.now()),
        );
      }
    },
  };
  return {
    get canPush() {
      return canPush;
    },
    get panel() {
      return routeSettings.settings;
    },
    update,
    get probe() {
      return probe;
    },
    get stackSize() {
      return stackSize.current;
    },
    get canGoBack() {
      return navigation.current.canGoBack();
    },
    actions,
  };
}
