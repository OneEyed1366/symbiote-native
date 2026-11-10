import { computed } from 'vue';
import { useNavigationState, useRoute } from '@symbiote-native/navigation/vue';
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
  const probe = computed(() => readProbe(route.value.params));
  const stackSize = useNavigationState(state => state.routes.length);
  const here = () => ({
    depth: probe.value.depth,
    anchorKey: probe.value.anchorKey,
    routeKey: route.value.key,
  });
  const canPush = computed(() => canPushProbe(panel.value));
  const actions = {
    pushProbe: () => {
      if (!canPush.value) return;
      navigation.value.push(
        ROUTE_NAME.StackTransitions,
        pushProbeParams(panel.value, here()),
      );
    },
    // The duration only shows on some animations, so this one picks one that obeys it
    pushTimedProbe: () => {
      if (!canPush.value) return;
      navigation.value.push(
        ROUTE_NAME.StackTransitions,
        pushProbeParams(timedPanelOf(panel.value), here()),
      );
    },
    // A replacement keeps the depth of the probe it replaces
    replaceWithProbe: () => {
      if (!canPush.value) return;
      navigation.value.replace(
        ROUTE_NAME.StackTransitions,
        pushProbeParams(panel.value, {
          ...here(),
          depth: probe.value.depth - 1,
        }),
      );
    },
    pop: () => navigation.value.pop(Number(panel.value.popCount)),
    popToTop: () => navigation.value.popToTop(),
    popToAnchor: () => {
      const { anchorKey } = probe.value;
      if (anchorKey !== undefined) navigation.value.popTo(anchorKey);
    },
    reset: () => {
      if (canPush.value) {
        navigation.value.reset(resetStateOf(panel.value, Date.now()));
      }
    },
  };
  return {
    canPush,
    panel,
    update,
    probe,
    stackSize,
    canGoBack: computed(() => navigation.value.canGoBack()),
    actions,
  };
}
