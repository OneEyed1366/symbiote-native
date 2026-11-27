<script>
  const rows = Array.from({ length: 30 }, (_, index) => index);
</script>

<scroll-view>{#each rows as row (row)}<view><text>{row}</text></view>{/each}</scroll-view>
