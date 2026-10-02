<script lang="ts">
  import {
    getCameraPermissionsAsync,
    getMediaLibraryPermissionsAsync,
    requestCameraPermissionsAsync,
    requestMediaLibraryPermissionsAsync,
    useCameraPermissions,
    useMediaLibraryPermissions,
  } from '@symbiote-native/image-picker/svelte';
  import Card from '../components/Card.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import ImagePickerPermissionBlock from './ImagePickerPermissionBlock.svelte';

  const color = lineColorOf(ROUTE_NAME.ImagePicker);

  const camera = useCameraPermissions();
  const library = useMediaLibraryPermissions();
</script>

<Card testID="image-picker-permissions-card" title="Permissions">
  <ImagePickerPermissionBlock
    prefix="image-picker-camera"
    title="Camera"
    {color}
    hookResponse={camera.status}
    hookRequest={camera.requestPermission}
    directGet={getCameraPermissionsAsync}
    directRequest={requestCameraPermissionsAsync}
  />
  <ImagePickerPermissionBlock
    prefix="image-picker-library"
    title="Media library"
    {color}
    hookResponse={library.status}
    hookRequest={library.requestPermission}
    directGet={() => getMediaLibraryPermissionsAsync()}
    directRequest={() => requestMediaLibraryPermissionsAsync()}
  />
</Card>
