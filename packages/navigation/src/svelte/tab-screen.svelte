<script lang="ts">
  // Tab.Screen: a declarative marker that paints nothing, registered through the same
  // context-based collector Stack.Screen uses (screen-registry.ts). The `'tab'` kind tag is what
  // stops it from silently registering with an ancestor Stack/Drawer when it is written in the
  // wrong place. See CLAUDE.md <third_party_rn_packages_are_react_only> - this and Tab import
  // nothing from react-native.
  import { collectScreen } from './screen-registry';
  import type { ITabScreenProps } from './tab-screen-props';

  let { name, component, options, initialParams }: ITabScreenProps = $props();

  collectScreen('tab', {
    get name(): ITabScreenProps['name'] {
      return name;
    },
    get component(): ITabScreenProps['component'] {
      return component;
    },
    get options(): ITabScreenProps['options'] {
      return options;
    },
    get initialParams(): unknown {
      return initialParams;
    },
  });
</script>
