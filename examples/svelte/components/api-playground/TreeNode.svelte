<script lang="ts" module>
  // <svelte:self> demo (Component Composition · Yes): a component recursing into its own tag to
  // render an arbitrarily nested tree — usable only inside {#if}/{#each}/{#snippet}/slotted
  // content, which the {#each} below satisfies.

  export type IApiPlaygroundTreeNode = {
    label: string;
    children?: IApiPlaygroundTreeNode[];
  };
</script>

<script lang="ts">
  let { node, depth = 0 }: { node: IApiPlaygroundTreeNode; depth?: number } =
    $props();
</script>

<view style={{ paddingLeft: depth * 14 }}>
  <text class="list-row-text">
    {`${'· '.repeat(depth)}${node.label}`}
  </text>
  {#if node.children !== undefined}
    {#each node.children as child (child.label)}
      <svelte:self node={child} depth={depth + 1} />
    {/each}
  {/if}
</view>
