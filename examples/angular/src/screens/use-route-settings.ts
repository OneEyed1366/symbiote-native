import { computed } from '@angular/core';
import {
  injectRoute,
  injectStackNavigation,
} from '@symbiote-native/navigation/angular';

// A panel keeps its state in the route params, the options resolver reads the same params
export function injectRouteSettings<T extends object>(
  read: (params: unknown) => T,
) {
  const route = injectRoute();
  const navigation = injectStackNavigation();
  return {
    settings: computed(() => read(route().params)),
    update: (patch: Partial<T>) => navigation.setParams(patch),
    navigation,
  };
}
