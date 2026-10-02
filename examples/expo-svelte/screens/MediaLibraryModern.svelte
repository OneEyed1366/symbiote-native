<script lang="ts">
  import MediaLibraryAlbumCards from './MediaLibraryAlbumCards.svelte';
  import MediaLibraryAssetCards from './MediaLibraryAssetCards.svelte';
  import MediaLibraryListener from './MediaLibraryListener.svelte';
  import MediaLibraryPermissions from './MediaLibraryPermissions.svelte';
  import MediaLibraryQuery from './MediaLibraryQuery.svelte';

  let assetId = $state('');

  function setAssetId(id: string): void {
    assetId = id;
  }
</script>

<MediaLibraryPermissions />
<MediaLibraryQuery {setAssetId} />
<MediaLibraryAssetCards {assetId} {setAssetId} />
<MediaLibraryAlbumCards {assetId} />
<MediaLibraryListener />
