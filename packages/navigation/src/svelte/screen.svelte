<script lang="ts">
  // Stack.Screen: a declarative marker that paints nothing. Stack reads it through the
  // context-based collector (screen-registry.ts) rather than by scanning children the way React
  // and Vue can, then mounts the registered component itself for each pushed route.
  //
  // Every field is handed over as a GETTER over this component's own `$props()` bindings, so the
  // navigator always sees the CURRENT value - reassigning `options` on an already-mounted marker
  // reaches the next options fold without re-registering.
  import { collectScreen } from './screen-registry';
  import type { IScreenProps } from './screen-props';

  let { name, component, options, initialParams }: IScreenProps = $props();

  collectScreen('stack', {
    get name(): IScreenProps['name'] {
      return name;
    },
    get component(): IScreenProps['component'] {
      return component;
    },
    get options(): IScreenProps['options'] {
      return options;
    },
    get initialParams(): unknown {
      return initialParams;
    },
  });
</script>
