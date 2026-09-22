<!--
  Symbiote canary app entry: composes the native stack navigator (@symbiote-native/navigation/vue,
  driven by react-native-screens' RNSScreen/RNSScreenStack native views) over the Expo-package demo
  surface — Menu, Sensors, Local auth. Menu is the initial route. Vue SFC twin of
  .examples/react/App.tsx: `<Screen>` (not the dotted `Stack.Screen`) is the same marker every
  ./screens SFC imports standalone — @symbiote-native/navigation/vue exports it at the top level
  (screen.ts) precisely so templates never need a dotted tag reference.
-->
<script setup lang="ts">
import { onMounted } from 'vue';
import { Screen, Stack } from '@symbiote-native/navigation/vue';
import { hide } from '@symbiote-native/splash-screen/vue';
import './App.css';

import MenuScreen from './screens/MenuScreen.vue';
import SensorsScreen from './screens/SensorsScreen.vue';
import LocalAuthScreen from './screens/LocalAuthScreen.vue';
import HapticsScreen from './screens/HapticsScreen.vue';
import ClipboardScreen from './screens/ClipboardScreen.vue';
import BatteryScreen from './screens/BatteryScreen.vue';
import BrightnessScreen from './screens/BrightnessScreen.vue';
import CellularScreen from './screens/CellularScreen.vue';
import NetworkScreen from './screens/NetworkScreen.vue';
import DeviceScreen from './screens/DeviceScreen.vue';
import ApplicationScreen from './screens/ApplicationScreen.vue';
import CryptoScreen from './screens/CryptoScreen.vue';
import WebCryptoScreen from './screens/WebCryptoScreen.vue';
import SystemUiScreen from './screens/SystemUiScreen.vue';
import StoreReviewScreen from './screens/StoreReviewScreen.vue';
import KeepAwakeScreen from './screens/KeepAwakeScreen.vue';
import ScreenOrientationScreen from './screens/ScreenOrientationScreen.vue';
import LocalizationScreen from './screens/LocalizationScreen.vue';
import TrackingTransparencyScreen from './screens/TrackingTransparencyScreen.vue';
import SecureStoreScreen from './screens/SecureStoreScreen.vue';
import SharingScreen from './screens/SharingScreen.vue';
import WebBrowserScreen from './screens/WebBrowserScreen.vue';
import SmsScreen from './screens/SmsScreen.vue';
import LocationScreen from './screens/LocationScreen.vue';
import MediaLibraryScreen from './screens/MediaLibraryScreen.vue';
import FileSystemScreen from './screens/FileSystemScreen.vue';
import AudioScreen from './screens/AudioScreen.vue';
import NotificationsScreen from './screens/NotificationsScreen.vue';
import BackgroundTasksScreen from './screens/BackgroundTasksScreen.vue';
import SqliteScreen from './screens/SqliteScreen.vue';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';

onMounted(() => hide());
</script>

<template>
  <Stack :initial-route-name="ROUTE_NAME.Menu">
    <Screen
      :name="ROUTE_NAME.Menu"
      :component="MenuScreen"
      :options="{
        title: 'Navigation Demos',
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Sensors"
      :component="SensorsScreen"
      :options="{
        title: 'Sensors',
        headerShown: true,
        headerTranslucent: true,
        headerTintColor: LINE_COLOR.sensors,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.LocalAuth"
      :component="LocalAuthScreen"
      :options="{
        title: 'Local Auth',
        headerShown: true,
        headerTintColor: LINE_COLOR['local-auth'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Haptics"
      :component="HapticsScreen"
      :options="{
        title: 'Haptics',
        headerShown: true,
        headerTintColor: LINE_COLOR.haptics,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Clipboard"
      :component="ClipboardScreen"
      :options="{
        title: 'Clipboard',
        headerShown: true,
        headerTintColor: LINE_COLOR.clipboard,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Battery"
      :component="BatteryScreen"
      :options="{
        title: 'Battery',
        headerShown: true,
        headerTintColor: LINE_COLOR.battery,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Brightness"
      :component="BrightnessScreen"
      :options="{
        title: 'Brightness',
        headerShown: true,
        headerTintColor: LINE_COLOR.brightness,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Cellular"
      :component="CellularScreen"
      :options="{
        title: 'Cellular',
        headerShown: true,
        headerTintColor: LINE_COLOR.cellular,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Network"
      :component="NetworkScreen"
      :options="{
        title: 'Network',
        headerShown: true,
        headerTintColor: LINE_COLOR.network,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Device"
      :component="DeviceScreen"
      :options="{
        title: 'Device',
        headerShown: true,
        headerTintColor: LINE_COLOR.device,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Application"
      :component="ApplicationScreen"
      :options="{
        title: 'Application',
        headerShown: true,
        headerTintColor: LINE_COLOR.application,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Crypto"
      :component="CryptoScreen"
      :options="{
        title: 'Crypto',
        headerShown: true,
        headerTintColor: LINE_COLOR.crypto,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.StandardWebCrypto"
      :component="WebCryptoScreen"
      :options="{
        title: 'Web Crypto',
        headerShown: true,
        headerTintColor: LINE_COLOR['standard-web-crypto'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.SystemUi"
      :component="SystemUiScreen"
      :options="{
        title: 'System UI',
        headerShown: true,
        headerTintColor: LINE_COLOR['system-ui'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.StoreReview"
      :component="StoreReviewScreen"
      :options="{
        title: 'Store Review',
        headerShown: true,
        headerTintColor: LINE_COLOR['store-review'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.KeepAwake"
      :component="KeepAwakeScreen"
      :options="{
        title: 'Keep Awake',
        headerShown: true,
        headerTintColor: LINE_COLOR['keep-awake'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.ScreenOrientation"
      :component="ScreenOrientationScreen"
      :options="{
        title: 'Screen Orientation',
        headerShown: true,
        headerTintColor: LINE_COLOR['screen-orientation'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Localization"
      :component="LocalizationScreen"
      :options="{
        title: 'Localization',
        headerShown: true,
        headerTintColor: LINE_COLOR.localization,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.TrackingTransparency"
      :component="TrackingTransparencyScreen"
      :options="{
        title: 'Tracking Transparency',
        headerShown: true,
        headerTintColor: LINE_COLOR['tracking-transparency'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.SecureStore"
      :component="SecureStoreScreen"
      :options="{
        title: 'Secure Store',
        headerShown: true,
        headerTintColor: LINE_COLOR['secure-store'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Sharing"
      :component="SharingScreen"
      :options="{
        title: 'Sharing',
        headerShown: true,
        headerTintColor: LINE_COLOR.sharing,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.WebBrowser"
      :component="WebBrowserScreen"
      :options="{
        title: 'Web Browser',
        headerShown: true,
        headerTintColor: LINE_COLOR['web-browser'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Sms"
      :component="SmsScreen"
      :options="{
        title: 'SMS',
        headerShown: true,
        headerTintColor: LINE_COLOR.sms,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Location"
      :component="LocationScreen"
      :options="{
        title: 'Location',
        headerShown: true,
        headerTintColor: LINE_COLOR.location,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.MediaLibrary"
      :component="MediaLibraryScreen"
      :options="{
        title: 'Media Library',
        headerShown: true,
        headerTintColor: LINE_COLOR['media-library'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.FileSystem"
      :component="FileSystemScreen"
      :options="{
        title: 'File System',
        headerShown: true,
        headerTintColor: LINE_COLOR['file-system'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Audio"
      :component="AudioScreen"
      :options="{
        title: 'Audio',
        headerShown: true,
        headerTintColor: LINE_COLOR.audio,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Notifications"
      :component="NotificationsScreen"
      :options="{
        title: 'Notifications',
        headerShown: true,
        headerTintColor: LINE_COLOR.notifications,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.BackgroundTasks"
      :component="BackgroundTasksScreen"
      :options="{
        title: 'Background Tasks',
        headerShown: true,
        headerTintColor: LINE_COLOR['background-tasks'],
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
    <Screen
      :name="ROUTE_NAME.Sqlite"
      :component="SqliteScreen"
      :options="{
        title: 'SQLite',
        headerShown: true,
        headerTintColor: LINE_COLOR.sqlite,
        headerTranslucent: true,
        headerTitleColor: '#ffffff',
        headerStyle: { backgroundColor: '#0b1622' },
        headerUserInterfaceStyle: 'dark',
      }"
    />
  </Stack>
</template>
