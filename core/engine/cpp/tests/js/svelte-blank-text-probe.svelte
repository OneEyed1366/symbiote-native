<script>
  let { emptied = false } = $props();
  let name = $state('Ada');
  $effect(() => {
    if (emptied) name = '';
  });
</script>

<view><text>{name}</text>&nbsp;<text>tail</text></view>
