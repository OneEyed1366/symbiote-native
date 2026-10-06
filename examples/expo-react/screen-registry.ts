import type { FC } from 'react';
import { ROUTE_NAME } from './routes';
import type { ITourRouteName } from './navigation-lines';
import { AgeRangeScreen } from './screens/AgeRangeScreen';
import { AppIntegrityScreen } from './screens/AppIntegrityScreen';
import { AppMetricsScreen } from './screens/AppMetricsScreen';
import { AppleAuthenticationScreen } from './screens/AppleAuthenticationScreen';
import { ApplicationScreen } from './screens/ApplicationScreen';
import { AssetScreen } from './screens/AssetScreen';
import { AudioScreen } from './screens/AudioScreen';
import { AuthSessionScreen } from './screens/AuthSessionScreen';
import { BackgroundTasksScreen } from './screens/BackgroundTasksScreen';
import { BatteryScreen } from './screens/BatteryScreen';
import { BlobScreen } from './screens/BlobScreen';
import { BlurScreen } from './screens/BlurScreen';
import { BrightnessScreen } from './screens/BrightnessScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { CameraScreen } from './screens/CameraScreen';
import { CellularScreen } from './screens/CellularScreen';
import { CheckboxScreen } from './screens/CheckboxScreen';
import { ClipboardScreen } from './screens/ClipboardScreen';
import { ContactsScreen } from './screens/ContactsScreen';
import { CryptoScreen } from './screens/CryptoScreen';
import { DeviceScreen } from './screens/DeviceScreen';
import { DocumentPickerScreen } from './screens/DocumentPickerScreen';
import { FileSystemScreen } from './screens/FileSystemScreen';
import { FontScreen } from './screens/FontScreen';
import { GlScreen } from './screens/GlScreen';
import { GlassEffectScreen } from './screens/GlassEffectScreen';
import { HapticsScreen } from './screens/HapticsScreen';
import { ImageManipulatorScreen } from './screens/ImageManipulatorScreen';
import { ImagePickerScreen } from './screens/ImagePickerScreen';
import { ImageScreen } from './screens/ImageScreen';
import { IntentLauncherScreen } from './screens/IntentLauncherScreen';
import { KeepAwakeScreen } from './screens/KeepAwakeScreen';
import { LinearGradientScreen } from './screens/LinearGradientScreen';
import { LivePhotoScreen } from './screens/LivePhotoScreen';
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
import { SymbolsScreen } from './screens/SymbolsScreen';
import { SystemUiScreen } from './screens/SystemUiScreen';
import { TrackingTransparencyScreen } from './screens/TrackingTransparencyScreen';
import { VideoScreen } from './screens/VideoScreen';
import { VideoThumbnailsScreen } from './screens/VideoThumbnailsScreen';
import { WebBrowserScreen } from './screens/WebBrowserScreen';
import { WebCryptoScreen } from './screens/WebCryptoScreen';

export type IScreenEntry = {
  route: ITourRouteName;
  component: FC;
  title: string;
};

// One row per demo screen, the stack header takes its color from the route's navigation line
export const SCREENS: readonly IScreenEntry[] = [
  { route: ROUTE_NAME.Sensors, component: SensorsScreen, title: 'Sensors' },
  {
    route: ROUTE_NAME.LocalAuth,
    component: LocalAuthScreen,
    title: 'Local Auth',
  },
  { route: ROUTE_NAME.Haptics, component: HapticsScreen, title: 'Haptics' },
  {
    route: ROUTE_NAME.Clipboard,
    component: ClipboardScreen,
    title: 'Clipboard',
  },
  { route: ROUTE_NAME.Battery, component: BatteryScreen, title: 'Battery' },
  {
    route: ROUTE_NAME.Brightness,
    component: BrightnessScreen,
    title: 'Brightness',
  },
  { route: ROUTE_NAME.Cellular, component: CellularScreen, title: 'Cellular' },
  { route: ROUTE_NAME.Network, component: NetworkScreen, title: 'Network' },
  { route: ROUTE_NAME.Device, component: DeviceScreen, title: 'Device' },
  {
    route: ROUTE_NAME.Application,
    component: ApplicationScreen,
    title: 'Application',
  },
  { route: ROUTE_NAME.Crypto, component: CryptoScreen, title: 'Crypto' },
  {
    route: ROUTE_NAME.StandardWebCrypto,
    component: WebCryptoScreen,
    title: 'Web Crypto',
  },
  { route: ROUTE_NAME.SystemUi, component: SystemUiScreen, title: 'System UI' },
  {
    route: ROUTE_NAME.StoreReview,
    component: StoreReviewScreen,
    title: 'Store Review',
  },
  {
    route: ROUTE_NAME.KeepAwake,
    component: KeepAwakeScreen,
    title: 'Keep Awake',
  },
  {
    route: ROUTE_NAME.ScreenOrientation,
    component: ScreenOrientationScreen,
    title: 'Screen Orientation',
  },
  {
    route: ROUTE_NAME.Localization,
    component: LocalizationScreen,
    title: 'Localization',
  },
  { route: ROUTE_NAME.Location, component: LocationScreen, title: 'Location' },
  {
    route: ROUTE_NAME.MediaLibrary,
    component: MediaLibraryScreen,
    title: 'Media Library',
  },
  {
    route: ROUTE_NAME.FileSystem,
    component: FileSystemScreen,
    title: 'File System',
  },
  {
    route: ROUTE_NAME.TrackingTransparency,
    component: TrackingTransparencyScreen,
    title: 'Tracking Transparency',
  },
  {
    route: ROUTE_NAME.SecureStore,
    component: SecureStoreScreen,
    title: 'Secure Store',
  },
  { route: ROUTE_NAME.Sharing, component: SharingScreen, title: 'Sharing' },
  {
    route: ROUTE_NAME.WebBrowser,
    component: WebBrowserScreen,
    title: 'Web Browser',
  },
  { route: ROUTE_NAME.Sms, component: SmsScreen, title: 'SMS' },
  { route: ROUTE_NAME.Audio, component: AudioScreen, title: 'Audio' },
  {
    route: ROUTE_NAME.Notifications,
    component: NotificationsScreen,
    title: 'Notifications',
  },
  {
    route: ROUTE_NAME.BackgroundTasks,
    component: BackgroundTasksScreen,
    title: 'Background Tasks',
  },
  { route: ROUTE_NAME.Sqlite, component: SqliteScreen, title: 'SQLite' },
  {
    route: ROUTE_NAME.MailComposer,
    component: MailComposerScreen,
    title: 'Mail Composer',
  },
  { route: ROUTE_NAME.Print, component: PrintScreen, title: 'Print' },
  { route: ROUTE_NAME.Speech, component: SpeechScreen, title: 'Speech' },
  {
    route: ROUTE_NAME.VideoThumbnails,
    component: VideoThumbnailsScreen,
    title: 'Video Thumbnails',
  },
  {
    route: ROUTE_NAME.DocumentPicker,
    component: DocumentPickerScreen,
    title: 'Document Picker',
  },
  {
    route: ROUTE_NAME.ImagePicker,
    component: ImagePickerScreen,
    title: 'Image Picker',
  },
  {
    route: ROUTE_NAME.ImageManipulator,
    component: ImageManipulatorScreen,
    title: 'Image Manipulator',
  },
  { route: ROUTE_NAME.Blob, component: BlobScreen, title: 'Blob' },
  {
    route: ROUTE_NAME.ScreenCapture,
    component: ScreenCaptureScreen,
    title: 'Screen Capture',
  },
  { route: ROUTE_NAME.Contacts, component: ContactsScreen, title: 'Contacts' },
  { route: ROUTE_NAME.Calendar, component: CalendarScreen, title: 'Calendar' },
  { route: ROUTE_NAME.AgeRange, component: AgeRangeScreen, title: 'Age Range' },
  {
    route: ROUTE_NAME.AppIntegrity,
    component: AppIntegrityScreen,
    title: 'App Integrity',
  },
  {
    route: ROUTE_NAME.IntentLauncher,
    component: IntentLauncherScreen,
    title: 'Intent Launcher',
  },
  {
    route: ROUTE_NAME.NavigationBar,
    component: NavigationBarScreen,
    title: 'Navigation Bar',
  },
  { route: ROUTE_NAME.Font, component: FontScreen, title: 'Font' },
  { route: ROUTE_NAME.Asset, component: AssetScreen, title: 'Asset' },
  {
    route: ROUTE_NAME.AppMetrics,
    component: AppMetricsScreen,
    title: 'App Metrics',
  },
  {
    route: ROUTE_NAME.AuthSession,
    component: AuthSessionScreen,
    title: 'Auth Session',
  },
  { route: ROUTE_NAME.Checkbox, component: CheckboxScreen, title: 'Checkbox' },
  {
    route: ROUTE_NAME.LinearGradient,
    component: LinearGradientScreen,
    title: 'Linear Gradient',
  },
  { route: ROUTE_NAME.Blur, component: BlurScreen, title: 'Blur' },
  {
    route: ROUTE_NAME.GlassEffect,
    component: GlassEffectScreen,
    title: 'Glass Effect',
  },
  { route: ROUTE_NAME.Symbols, component: SymbolsScreen, title: 'Symbols' },
  {
    route: ROUTE_NAME.AppleAuthentication,
    component: AppleAuthenticationScreen,
    title: 'Apple Authentication',
  },
  { route: ROUTE_NAME.Image, component: ImageScreen, title: 'Image' },
  { route: ROUTE_NAME.Video, component: VideoScreen, title: 'Video' },
  { route: ROUTE_NAME.Camera, component: CameraScreen, title: 'Camera' },
  {
    route: ROUTE_NAME.LivePhoto,
    component: LivePhotoScreen,
    title: 'Live Photo',
  },
  { route: ROUTE_NAME.Gl, component: GlScreen, title: 'GL' },
];
