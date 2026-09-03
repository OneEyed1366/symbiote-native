<script lang="ts">
  // Drawer.Screen: a declarative marker that paints nothing, registered through the same
  // context-based collector Stack.Screen/Tab.Screen use (screen-registry.ts). See CLAUDE.md
  // <third_party_rn_packages_are_react_only> - this and Drawer import nothing from react-native.
  import { collectScreen } from './screen-registry';
  import type { IDrawerScreenProps } from './drawer-screen-props';

  let { name, component, options, initialParams }: IDrawerScreenProps =
    $props();

  collectScreen('drawer', {
    get name(): IDrawerScreenProps['name'] {
      return name;
    },
    get component(): IDrawerScreenProps['component'] {
      return component;
    },
    get options(): IDrawerScreenProps['options'] {
      return options;
    },
    get initialParams(): unknown {
      return initialParams;
    },
  });
</script>
