import type { Type } from '@angular/core';
import type { INavLine } from './navigation-lines';
import { ROUTE_NAME } from './routes';
import { GlScreen } from './screens/GlScreen';
import { LivePhotoScreen } from './screens/LivePhotoScreen';
import { CameraScreen } from './screens/CameraScreen';
import { VideoScreen } from './screens/VideoScreen';
import { ImageScreen } from './screens/ImageScreen';
import { AppleAuthenticationScreen } from './screens/AppleAuthenticationScreen';
import { SymbolsScreen } from './screens/SymbolsScreen';
import { GlassEffectScreen } from './screens/GlassEffectScreen';
import { BlurScreen } from './screens/BlurScreen';
import { LinearGradientScreen } from './screens/LinearGradientScreen';
import { CheckboxScreen } from './screens/CheckboxScreen';
import { AgeRangeScreen } from './screens/AgeRangeScreen';
import { AppIntegrityScreen } from './screens/AppIntegrityScreen';
import { AppMetricsScreen } from './screens/AppMetricsScreen';
import { ApplicationScreen } from './screens/ApplicationScreen';
import { AssetScreen } from './screens/AssetScreen';
import { AudioScreen } from './screens/AudioScreen';
import { AuthSessionScreen } from './screens/AuthSessionScreen';
import { BackgroundTasksScreen } from './screens/BackgroundTasksScreen';
import { BatteryScreen } from './screens/BatteryScreen';
import { BlobScreen } from './screens/BlobScreen';
import { BrightnessScreen } from './screens/BrightnessScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { CellularScreen } from './screens/CellularScreen';
import { ClipboardScreen } from './screens/ClipboardScreen';
import { ContactsScreen } from './screens/ContactsScreen';
import { CryptoScreen } from './screens/CryptoScreen';
import { DeviceScreen } from './screens/DeviceScreen';
import { DocumentPickerScreen } from './screens/DocumentPickerScreen';
import { FileSystemScreen } from './screens/FileSystemScreen';
import { FontScreen } from './screens/FontScreen';
import { HapticsScreen } from './screens/HapticsScreen';
import { ImageManipulatorScreen } from './screens/ImageManipulatorScreen';
import { ImagePickerScreen } from './screens/ImagePickerScreen';
import { IntentLauncherScreen } from './screens/IntentLauncherScreen';
import { KeepAwakeScreen } from './screens/KeepAwakeScreen';
import { LocalAuthScreen } from './screens/LocalAuthScreen';
import { LocalizationScreen } from './screens/LocalizationScreen';
import { LocationScreen } from './screens/LocationScreen';
import { MailComposerScreen } from './screens/MailComposerScreen';
import { MediaLibraryScreen } from './screens/MediaLibraryScreen';
import { NavigationBarScreen } from './screens/NavigationBarScreen';
import { NetworkScreen } from './screens/NetworkScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { PrintScreen } from './screens/PrintScreen';
import { ScreenCaptureScreen } from './screens/ScreenCaptureScreen';
import { ScreenOrientationScreen } from './screens/ScreenOrientationScreen';
import { SecureStoreScreen } from './screens/SecureStoreScreen';
import { SensorsScreen } from './screens/SensorsScreen';
import { SharingScreen } from './screens/SharingScreen';
import { SmsScreen } from './screens/SmsScreen';
import { SpeechScreen } from './screens/SpeechScreen';
import { SqliteScreen } from './screens/SqliteScreen';
import { StoreReviewScreen } from './screens/StoreReviewScreen';
import { SystemUiScreen } from './screens/SystemUiScreen';
import { TrackingTransparencyScreen } from './screens/TrackingTransparencyScreen';
import { VideoThumbnailsScreen } from './screens/VideoThumbnailsScreen';
import { WebBrowserScreen } from './screens/WebBrowserScreen';
import { WebCryptoScreen } from './screens/WebCryptoScreen';

export type IScreenEntry = {
  name: string;
  component: Type<unknown>;
  title: string;
  line: INavLine;
};

// Every demo screen except Menu, in menu order; App.ts turns each row into a `symbioteScreen`
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
  {
    name: ROUTE_NAME.Checkbox,
    component: CheckboxScreen,
    title: 'Checkbox',
    line: 'checkbox',
  },
  {
    name: ROUTE_NAME.LinearGradient,
    component: LinearGradientScreen,
    title: 'Linear Gradient',
    line: 'linear-gradient',
  },
  {
    name: ROUTE_NAME.Blur,
    component: BlurScreen,
    title: 'Blur',
    line: 'blur',
  },
  {
    name: ROUTE_NAME.GlassEffect,
    component: GlassEffectScreen,
    title: 'Glass Effect',
    line: 'glass-effect',
  },
  {
    name: ROUTE_NAME.Symbols,
    component: SymbolsScreen,
    title: 'Symbols',
    line: 'symbols',
  },
  {
    name: ROUTE_NAME.AppleAuthentication,
    component: AppleAuthenticationScreen,
    title: 'Apple Authentication',
    line: 'apple-authentication',
  },
  {
    name: ROUTE_NAME.Image,
    component: ImageScreen,
    title: 'Image',
    line: 'expo-image',
  },
  {
    name: ROUTE_NAME.Video,
    component: VideoScreen,
    title: 'Video',
    line: 'video',
  },
  {
    name: ROUTE_NAME.Camera,
    component: CameraScreen,
    title: 'Camera',
    line: 'camera',
  },
  {
    name: ROUTE_NAME.LivePhoto,
    component: LivePhotoScreen,
    title: 'Live Photo',
    line: 'live-photo',
  },
  {
    name: ROUTE_NAME.Gl,
    component: GlScreen,
    title: 'GL',
    line: 'gl',
  },
];
