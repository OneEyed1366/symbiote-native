import type { Component } from 'vue';
import type { INavLine } from './navigation-lines';
import { ROUTE_NAME } from './routes';
import AgeRangeScreen from './screens/AgeRangeScreen.vue';
import AppIntegrityScreen from './screens/AppIntegrityScreen.vue';
import AppMetricsScreen from './screens/AppMetricsScreen.vue';
import ApplicationScreen from './screens/ApplicationScreen.vue';
import AssetScreen from './screens/AssetScreen.vue';
import AudioScreen from './screens/AudioScreen.vue';
import AuthSessionScreen from './screens/AuthSessionScreen.vue';
import BackgroundTasksScreen from './screens/BackgroundTasksScreen.vue';
import BatteryScreen from './screens/BatteryScreen.vue';
import BlobScreen from './screens/BlobScreen.vue';
import BrightnessScreen from './screens/BrightnessScreen.vue';
import CalendarScreen from './screens/CalendarScreen.vue';
import CellularScreen from './screens/CellularScreen.vue';
import ClipboardScreen from './screens/ClipboardScreen.vue';
import ContactsScreen from './screens/ContactsScreen.vue';
import CryptoScreen from './screens/CryptoScreen.vue';
import DeviceScreen from './screens/DeviceScreen.vue';
import DocumentPickerScreen from './screens/DocumentPickerScreen.vue';
import FileSystemScreen from './screens/FileSystemScreen.vue';
import FontScreen from './screens/FontScreen.vue';
import HapticsScreen from './screens/HapticsScreen.vue';
import ImageManipulatorScreen from './screens/ImageManipulatorScreen.vue';
import ImagePickerScreen from './screens/ImagePickerScreen.vue';
import IntentLauncherScreen from './screens/IntentLauncherScreen.vue';
import KeepAwakeScreen from './screens/KeepAwakeScreen.vue';
import LocalAuthScreen from './screens/LocalAuthScreen.vue';
import LocalizationScreen from './screens/LocalizationScreen.vue';
import LocationScreen from './screens/LocationScreen.vue';
import MailComposerScreen from './screens/MailComposerScreen.vue';
import MediaLibraryScreen from './screens/MediaLibraryScreen.vue';
import NavigationBarScreen from './screens/NavigationBarScreen.vue';
import NetworkScreen from './screens/NetworkScreen.vue';
import NotificationsScreen from './screens/NotificationsScreen.vue';
import PrintScreen from './screens/PrintScreen.vue';
import ScreenCaptureScreen from './screens/ScreenCaptureScreen.vue';
import ScreenOrientationScreen from './screens/ScreenOrientationScreen.vue';
import SecureStoreScreen from './screens/SecureStoreScreen.vue';
import SensorsScreen from './screens/SensorsScreen.vue';
import SharingScreen from './screens/SharingScreen.vue';
import SmsScreen from './screens/SmsScreen.vue';
import SpeechScreen from './screens/SpeechScreen.vue';
import SqliteScreen from './screens/SqliteScreen.vue';
import StoreReviewScreen from './screens/StoreReviewScreen.vue';
import SystemUiScreen from './screens/SystemUiScreen.vue';
import TrackingTransparencyScreen from './screens/TrackingTransparencyScreen.vue';
import VideoThumbnailsScreen from './screens/VideoThumbnailsScreen.vue';
import WebBrowserScreen from './screens/WebBrowserScreen.vue';
import WebCryptoScreen from './screens/WebCryptoScreen.vue';

export type IScreenEntry = {
  name: string;
  component: Component;
  title: string;
  line: INavLine;
};

// Every demo screen except Menu, in menu order; App.vue turns each row into a `<Screen>`
export const SCREENS: readonly IScreenEntry[] = [
  {
    name: ROUTE_NAME.Sensors,
    component: SensorsScreen,
    title: 'Sensors',
    line: 'sensors',
  },
  {
    name: ROUTE_NAME.LocalAuth,
    component: LocalAuthScreen,
    title: 'Local Auth',
    line: 'local-auth',
  },
  {
    name: ROUTE_NAME.Haptics,
    component: HapticsScreen,
    title: 'Haptics',
    line: 'haptics',
  },
  {
    name: ROUTE_NAME.Clipboard,
    component: ClipboardScreen,
    title: 'Clipboard',
    line: 'clipboard',
  },
  {
    name: ROUTE_NAME.Battery,
    component: BatteryScreen,
    title: 'Battery',
    line: 'battery',
  },
  {
    name: ROUTE_NAME.Brightness,
    component: BrightnessScreen,
    title: 'Brightness',
    line: 'brightness',
  },
  {
    name: ROUTE_NAME.Cellular,
    component: CellularScreen,
    title: 'Cellular',
    line: 'cellular',
  },
  {
    name: ROUTE_NAME.Network,
    component: NetworkScreen,
    title: 'Network',
    line: 'network',
  },
  {
    name: ROUTE_NAME.Device,
    component: DeviceScreen,
    title: 'Device',
    line: 'device',
  },
  {
    name: ROUTE_NAME.Application,
    component: ApplicationScreen,
    title: 'Application',
    line: 'application',
  },
  {
    name: ROUTE_NAME.Crypto,
    component: CryptoScreen,
    title: 'Crypto',
    line: 'crypto',
  },
  {
    name: ROUTE_NAME.StandardWebCrypto,
    component: WebCryptoScreen,
    title: 'Web Crypto',
    line: 'standard-web-crypto',
  },
  {
    name: ROUTE_NAME.SystemUi,
    component: SystemUiScreen,
    title: 'System UI',
    line: 'system-ui',
  },
  {
    name: ROUTE_NAME.StoreReview,
    component: StoreReviewScreen,
    title: 'Store Review',
    line: 'store-review',
  },
  {
    name: ROUTE_NAME.KeepAwake,
    component: KeepAwakeScreen,
    title: 'Keep Awake',
    line: 'keep-awake',
  },
  {
    name: ROUTE_NAME.ScreenOrientation,
    component: ScreenOrientationScreen,
    title: 'Screen Orientation',
    line: 'screen-orientation',
  },
  {
    name: ROUTE_NAME.Localization,
    component: LocalizationScreen,
    title: 'Localization',
    line: 'localization',
  },
  {
    name: ROUTE_NAME.TrackingTransparency,
    component: TrackingTransparencyScreen,
    title: 'Tracking Transparency',
    line: 'tracking-transparency',
  },
  {
    name: ROUTE_NAME.SecureStore,
    component: SecureStoreScreen,
    title: 'Secure Store',
    line: 'secure-store',
  },
  {
    name: ROUTE_NAME.Sharing,
    component: SharingScreen,
    title: 'Sharing',
    line: 'sharing',
  },
  {
    name: ROUTE_NAME.WebBrowser,
    component: WebBrowserScreen,
    title: 'Web Browser',
    line: 'web-browser',
  },
  { name: ROUTE_NAME.Sms, component: SmsScreen, title: 'SMS', line: 'sms' },
  {
    name: ROUTE_NAME.Location,
    component: LocationScreen,
    title: 'Location',
    line: 'location',
  },
  {
    name: ROUTE_NAME.MediaLibrary,
    component: MediaLibraryScreen,
    title: 'Media Library',
    line: 'media-library',
  },
  {
    name: ROUTE_NAME.FileSystem,
    component: FileSystemScreen,
    title: 'File System',
    line: 'file-system',
  },
  {
    name: ROUTE_NAME.Audio,
    component: AudioScreen,
    title: 'Audio',
    line: 'audio',
  },
  {
    name: ROUTE_NAME.Notifications,
    component: NotificationsScreen,
    title: 'Notifications',
    line: 'notifications',
  },
  {
    name: ROUTE_NAME.BackgroundTasks,
    component: BackgroundTasksScreen,
    title: 'Background Tasks',
    line: 'background-tasks',
  },
  {
    name: ROUTE_NAME.Sqlite,
    component: SqliteScreen,
    title: 'SQLite',
    line: 'sqlite',
  },
  {
    name: ROUTE_NAME.MailComposer,
    component: MailComposerScreen,
    title: 'Mail Composer',
    line: 'mail-composer',
  },
  {
    name: ROUTE_NAME.Print,
    component: PrintScreen,
    title: 'Print',
    line: 'print',
  },
  {
    name: ROUTE_NAME.Speech,
    component: SpeechScreen,
    title: 'Speech',
    line: 'speech',
  },
  {
    name: ROUTE_NAME.VideoThumbnails,
    component: VideoThumbnailsScreen,
    title: 'Video Thumbnails',
    line: 'video-thumbnails',
  },
  {
    name: ROUTE_NAME.DocumentPicker,
    component: DocumentPickerScreen,
    title: 'Document Picker',
    line: 'document-picker',
  },
  {
    name: ROUTE_NAME.ImagePicker,
    component: ImagePickerScreen,
    title: 'Image Picker',
    line: 'image-picker',
  },
  {
    name: ROUTE_NAME.ImageManipulator,
    component: ImageManipulatorScreen,
    title: 'Image Manipulator',
    line: 'image-manipulator',
  },
  { name: ROUTE_NAME.Blob, component: BlobScreen, title: 'Blob', line: 'blob' },
  {
    name: ROUTE_NAME.ScreenCapture,
    component: ScreenCaptureScreen,
    title: 'Screen Capture',
    line: 'screen-capture',
  },
  {
    name: ROUTE_NAME.Contacts,
    component: ContactsScreen,
    title: 'Contacts',
    line: 'contacts',
  },
  {
    name: ROUTE_NAME.Calendar,
    component: CalendarScreen,
    title: 'Calendar',
    line: 'calendar',
  },
  {
    name: ROUTE_NAME.AgeRange,
    component: AgeRangeScreen,
    title: 'Age Range',
    line: 'age-range',
  },
  {
    name: ROUTE_NAME.AppIntegrity,
    component: AppIntegrityScreen,
    title: 'App Integrity',
    line: 'app-integrity',
  },
  {
    name: ROUTE_NAME.IntentLauncher,
    component: IntentLauncherScreen,
    title: 'Intent Launcher',
    line: 'intent-launcher',
  },
  {
    name: ROUTE_NAME.NavigationBar,
    component: NavigationBarScreen,
    title: 'Navigation Bar',
    line: 'navigation-bar',
  },
  { name: ROUTE_NAME.Font, component: FontScreen, title: 'Font', line: 'font' },
  {
    name: ROUTE_NAME.Asset,
    component: AssetScreen,
    title: 'Asset',
    line: 'asset',
  },
  {
    name: ROUTE_NAME.AppMetrics,
    component: AppMetricsScreen,
    title: 'App Metrics',
    line: 'app-metrics',
  },
  {
    name: ROUTE_NAME.AuthSession,
    component: AuthSessionScreen,
    title: 'Auth Session',
    line: 'auth-session',
  },
];
