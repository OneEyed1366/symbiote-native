<script lang="ts">
  import DescriptorHost from '@symbiote-native/svelte/descriptor-host';
  import { renderLinearGradient } from '../core/linear-gradient';
  import type { ILinearGradientProps } from './linear-gradient-props';

  const { children, ...rest }: ILinearGradientProps = $props();
  const descriptor = $derived(renderLinearGradient({ ...rest }));
</script>

<DescriptorHost {descriptor} {children} />
