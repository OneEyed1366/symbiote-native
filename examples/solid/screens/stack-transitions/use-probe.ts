import { createMemo } from 'solid-js';
import {
  createNavigationState,
  useRoute,
} from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../../routes';
import { useRouteSettings } from '../use-route-settings';
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
  const { settings: panel, update, navigation } = useRouteSettings(readPanel);
  const probe = createMemo(() => readProbe(route().params));
  const stackSize = createNavigationState(state => state.routes.length);
  const here = () => ({
    depth: probe().depth,
    anchorKey: probe().anchorKey,
    routeKey: route().key,
  });
  const canPush = createMemo(() => canPushProbe(panel()));
  const actions = {
    pushProbe: () => {
      if (!canPush()) return;
      navigation().push(
        ROUTE_NAME.StackTransitions,
        pushProbeParams(panel(), here()),
      );
    },
    // The duration only shows on some animations, so this one picks one that obeys it
    pushTimedProbe: () => {
      if (!canPush()) return;
      navigation().push(
        ROUTE_NAME.StackTransitions,
        pushProbeParams(timedPanelOf(panel()), here()),
      );
    },
    // A replacement keeps the depth of the probe it replaces
    replaceWithProbe: () => {
      if (!canPush()) return;
      navigation().replace(
        ROUTE_NAME.StackTransitions,
        pushProbeParams(panel(), { ...here(), depth: probe().depth - 1 }),
      );
    },
    pop: () => navigation().pop(Number(panel().popCount)),
    popToTop: () => navigation().popToTop(),
    popToAnchor: () => {
      const { anchorKey } = probe();
      if (anchorKey !== undefined) navigation().popTo(anchorKey);
    },
    reset: () => {
      if (canPush()) navigation().reset(resetStateOf(panel(), Date.now()));
    },
  };
  return {
    canPush,
    panel,
    update,
    probe,
    stackSize,
    canGoBack: () => navigation().canGoBack(),
    actions,
  };
}
