import { defineComponent, onUnmounted, type VNode } from '@vue/runtime-core';
import { createHostNodeHolder } from '@symbiote-native/components';
import type { ICreateNativeViewController } from '@symbiote-native/components';
import { descriptorToVue } from '../descriptor-to-vue';
import { normalizeVueAttrs } from '../utils/normalize-attrs';

// A Vue component over a package's native view: every attr is a prop of the native view, the
// handle of its controller is exposed to a template ref
export function defineNativeViewComponent<THandle extends object>(
  name: string,
  createController: ICreateNativeViewController<THandle>,
) {
  return defineComponent({
    name,
    // Nothing may leak onto the wrapper, the attrs are the props of the native view
    inheritAttrs: false,
    setup(_props, { attrs, expose }) {
      const host = createHostNodeHolder();
      const controller = createController(host.getNode);
      expose(controller.handle);
      onUnmounted(() => controller.dispose?.());
      return (): VNode | null => {
        const descriptor = controller.render(normalizeVueAttrs(attrs));
        return descriptor ? descriptorToVue(host.capture(descriptor)) : null;
      };
    },
  });
}
