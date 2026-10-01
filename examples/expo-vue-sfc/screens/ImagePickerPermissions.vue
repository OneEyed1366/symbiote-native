<script setup lang="ts">
import { computed } from 'vue';
import {
  getCameraPermissionsAsync,
  getMediaLibraryPermissionsAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  useCameraPermissions,
  useMediaLibraryPermissions,
} from '@symbiote-native/image-picker/vue';
import Card from '../components/Card.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import ImagePickerPermissionBlock from './ImagePickerPermissionBlock.vue';

const color = lineColorOf(ROUTE_NAME.ImagePicker);

const [cameraRef, requestCamera] = useCameraPermissions();
const [libraryRef, requestLibrary] = useMediaLibraryPermissions();
const cameraResponse = computed(() => cameraRef.value);
const libraryResponse = computed(() => libraryRef.value);
</script>

<template>
  <Card testID="image-picker-permissions-card" title="Permissions">
    <ImagePickerPermissionBlock
      prefix="image-picker-camera"
      title="Camera"
      :color="color"
      :hookResponse="cameraResponse"
      :hookRequest="requestCamera"
      :directGet="getCameraPermissionsAsync"
      :directRequest="requestCameraPermissionsAsync"
    />
    <ImagePickerPermissionBlock
      prefix="image-picker-library"
      title="Media library"
      :color="color"
      :hookResponse="libraryResponse"
      :hookRequest="requestLibrary"
      :directGet="() => getMediaLibraryPermissionsAsync()"
      :directRequest="() => requestMediaLibraryPermissionsAsync()"
    />
  </Card>
</template>
