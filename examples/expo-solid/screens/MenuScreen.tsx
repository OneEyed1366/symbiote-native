import { For } from 'solid-js';
import { useStackNavigation } from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import type { ITourRouteName } from '../navigation-lines';
import { ROUTE_LINE_INFO } from '../navigation-lines';

type IMenuItem = {
  label: string;
  route: ITourRouteName;
  hint: string;
};

const MENU_ITEMS: readonly IMenuItem[] = [
  {
    label: 'Sensors',
    route: ROUTE_NAME.Sensors,
    hint: '@symbiote-native/sensors — accelerometer, gyroscope, magnetometer, device motion, pedometer',
  },
  {
    label: 'Local auth',
    route: ROUTE_NAME.LocalAuth,
    hint: '@symbiote-native/local-auth — FaceID/TouchID/fingerprint',
  },
  {
    label: 'Haptics',
    route: ROUTE_NAME.Haptics,
    hint: '@symbiote-native/haptics — impact/notification/selection vibration feedback',
  },
  {
    label: 'Clipboard',
    route: ROUTE_NAME.Clipboard,
    hint: '@symbiote-native/clipboard — read/write clipboard text, URLs, and change events',
  },
  {
    label: 'Battery',
    route: ROUTE_NAME.Battery,
    hint: '@symbiote-native/battery — live battery level, charging state, and low-power mode',
  },
  {
    label: 'Brightness',
    route: ROUTE_NAME.Brightness,
    hint: '@symbiote-native/brightness — screen brightness get/set, Android system-brightness mode, permission gating',
  },
  {
    label: 'Cellular',
    route: ROUTE_NAME.Cellular,
    hint: '@symbiote-native/cellular — cellular generation, carrier/SIM info, permission gating',
  },
  {
    label: 'Network',
    route: ROUTE_NAME.Network,
    hint: '@symbiote-native/network — live network state, IP address, airplane mode',
  },
  {
    label: 'Device',
    route: ROUTE_NAME.Device,
    hint: '@symbiote-native/device — device brand/model/OS info, memory, root/jailbreak detection',
  },
  {
    label: 'Application',
    route: ROUTE_NAME.Application,
    hint: '@symbiote-native/application — app version/build/name/ID, install time, Android ID, iOS vendor ID',
  },
  {
    label: 'Crypto',
    route: ROUTE_NAME.Crypto,
    hint: '@symbiote-native/crypto — random bytes/UUID, cryptographic digest (SHA-1/256/384/512, MD2/4/5)',
  },
  {
    label: 'Web Crypto',
    route: ROUTE_NAME.StandardWebCrypto,
    hint: '@symbiote-native/standard-web-crypto — Web Crypto API getRandomValues polyfill over globalThis.crypto',
  },
  {
    label: 'System UI',
    route: ROUTE_NAME.SystemUi,
    hint: '@symbiote-native/system-ui — get/set the root view background color',
  },
  {
    label: 'Store Review',
    route: ROUTE_NAME.StoreReview,
    hint: '@symbiote-native/store-review — prompts the native App Store/Play Store in-app review flow',
  },
  {
    label: 'Keep Awake',
    route: ROUTE_NAME.KeepAwake,
    hint: '@symbiote-native/keep-awake — keeps the screen on for the lifetime of a mounted component',
  },
  {
    label: 'Screen Orientation',
    route: ROUTE_NAME.ScreenOrientation,
    hint: '@symbiote-native/screen-orientation — lock/unlock orientation, live orientation + lock state',
  },
  {
    label: 'Localization',
    route: ROUTE_NAME.Localization,
    hint: '@symbiote-native/localization — locales and calendars, both reactive to device settings changes',
  },
  {
    label: 'Location',
    route: ROUTE_NAME.Location,
    hint: '@symbiote-native/location — foreground/background position, geocoding, motion activity',
  },
  {
    label: 'Media Library',
    route: ROUTE_NAME.MediaLibrary,
    hint: '@symbiote-native/media-library — photo/video library: permissions, albums, assets, change events',
  },
  {
    label: 'File System',
    route: ROUTE_NAME.FileSystem,
    hint: '@symbiote-native/file-system — legacy read/write/copy/move/delete plus the modern File/Directory/Paths API',
  },
  {
    label: 'Tracking Transparency',
    route: ROUTE_NAME.TrackingTransparency,
    hint: '@symbiote-native/tracking-transparency — iOS App Tracking Transparency prompt + advertising ID',
  },
  {
    label: 'Secure Store',
    route: ROUTE_NAME.SecureStore,
    hint: '@symbiote-native/secure-store — encrypted key/value storage in the Keychain/Keystore, optionally behind biometrics',
  },
  {
    label: 'Sharing',
    route: ROUTE_NAME.Sharing,
    hint: '@symbiote-native/sharing — opens the platform share sheet for a local file',
  },
  {
    label: 'Web Browser',
    route: ROUTE_NAME.WebBrowser,
    hint: '@symbiote-native/web-browser — in-app browser (SFSafariViewController / Custom Tabs) and the OAuth auth session',
  },
  {
    label: 'SMS',
    route: ROUTE_NAME.Sms,
    hint: '@symbiote-native/sms — opens the system SMS composer prefilled with recipients and a message',
  },
  {
    label: 'Audio',
    route: ROUTE_NAME.Audio,
    hint: '@symbiote-native/audio — remote-URL playback, recording, and the audio-session mode toggle',
  },
  {
    label: 'Notifications',
    route: ROUTE_NAME.Notifications,
    hint: '@symbiote-native/notifications — permissions, scheduling, presentation, badges, Android channels',
  },
  {
    label: 'Background Tasks',
    route: ROUTE_NAME.BackgroundTasks,
    hint: '@symbiote-native/task-manager + background-fetch + background-task — task registration and periodic/OS-scheduled background work',
  },
  {
    label: 'SQLite',
    route: ROUTE_NAME.Sqlite,
    hint: '@symbiote-native/sqlite — Provider-scoped database, tagged-template SQL, transactions, and a SQLite-backed key-value store',
  },
  {
    label: 'Mail Composer',
    route: ROUTE_NAME.MailComposer,
    hint: '@symbiote-native/mail-composer — system mail composer prefilled with recipients, subject, body and attachments; installed mail clients',
  },
  {
    label: 'Print',
    route: ROUTE_NAME.Print,
    hint: '@symbiote-native/print — AirPrint / Android print framework for HTML or a file, printer picker, HTML to PDF',
  },
  {
    label: 'Speech',
    route: ROUTE_NAME.Speech,
    hint: '@symbiote-native/speech — text-to-speech: voices, pitch/rate/volume, pause/resume, boundary events',
  },
  {
    label: 'Video Thumbnails',
    route: ROUTE_NAME.VideoThumbnails,
    hint: '@symbiote-native/video-thumbnails — still-frame image from a local or remote video at a chosen time and quality',
  },
  {
    label: 'Document Picker',
    route: ROUTE_NAME.DocumentPicker,
    hint: '@symbiote-native/document-picker — system document picker: MIME filters, multiple selection, cache copy',
  },
  {
    label: 'Image Picker',
    route: ROUTE_NAME.ImagePicker,
    hint: '@symbiote-native/image-picker — photo library and camera picker, editing/crop, video presets, permissions',
  },
  {
    label: 'Image Manipulator',
    route: ROUTE_NAME.ImageManipulator,
    hint: '@symbiote-native/image-manipulator — resize, rotate, flip, crop and save as JPEG/PNG/WEBP, chainable context and hook',
  },
  {
    label: 'Blob',
    route: ROUTE_NAME.Blob,
    hint: '@symbiote-native/blob — native JSI-backed W3C Blob: slice, bytes, text, arrayBuffer, stream',
  },
  {
    label: 'Screen Capture',
    route: ROUTE_NAME.ScreenCapture,
    hint: '@symbiote-native/screen-capture — block screenshots and recording, app-switcher blur, screenshot listener, permissions',
  },
  {
    label: 'Contacts',
    route: ROUTE_NAME.Contacts,
    hint: '@symbiote-native/contacts — modern Contact/Group/Container API, iOS 18 access button, legacy function API',
  },
  {
    label: 'Calendar',
    route: ROUTE_NAME.Calendar,
    hint: '@symbiote-native/calendar — modern ExpoCalendar/event/attendee/reminder classes, recurrence and alarms, legacy function API',
  },
  {
    label: 'Age Range',
    route: ROUTE_NAME.AgeRange,
    hint: '@symbiote-native/age-range — Apple Declared Age Range and Google Play Age Signals, fake signals for testing',
  },
  {
    label: 'App Integrity',
    route: ROUTE_NAME.AppIntegrity,
    hint: '@symbiote-native/app-integrity — App Attest, Play Integrity and Android hardware-attested keys',
  },
  {
    label: 'Intent Launcher',
    route: ROUTE_NAME.IntentLauncher,
    hint: '@symbiote-native/intent-launcher — Android only: start any system activity or app with a full intent',
  },
  {
    label: 'Navigation Bar',
    route: ROUTE_NAME.NavigationBar,
    hint: '@symbiote-native/navigation-bar — Android only: style and hide the system navigation bar, component, stack and listener',
  },
  {
    label: 'Font',
    route: ROUTE_NAME.Font,
    hint: '@symbiote-native/font — runtime font loading from uri, FontResource or Asset, useFonts, glyphs to image',
  },
  {
    label: 'Asset',
    route: ROUTE_NAME.Asset,
    hint: '@symbiote-native/asset — bundled modules, remote uris and metadata as Asset objects, downloads, useAssets',
  },
  {
    label: 'App Metrics',
    route: ROUTE_NAME.AppMetrics,
    hint: '@symbiote-native/app-metrics — startup marks, sessions, log events, error reporting, boundary and network observer',
  },
  {
    label: 'Auth Session',
    route: ROUTE_NAME.AuthSession,
    hint: '@symbiote-native/auth-session — OAuth 2 and OpenID Connect: discovery, AuthRequest with PKCE, token calls, Google and Facebook hooks',
  },
  {
    label: 'Checkbox',
    route: ROUTE_NAME.Checkbox,
    hint: 'Checkbox — native checkbox primitive: value, color, disabled, forms, terms and conditions, settings lists',
  },
  {
    label: 'Linear Gradient',
    route: ROUTE_NAME.LinearGradient,
    hint: '@symbiote-native/linear-gradient — color stops, locations, start/end points as banners, scrims and progress fills',
  },
  {
    label: 'Blur',
    route: ROUTE_NAME.Blur,
    hint: '@symbiote-native/blur — BlurView tints and intensity over live content, Android BlurTargetView',
  },
  {
    label: 'Glass Effect',
    route: ROUTE_NAME.GlassEffect,
    hint: '@symbiote-native/glass-effect — iOS 26 Liquid Glass: styles, tint, interactive, container spacing',
  },
  {
    label: 'Symbols',
    route: ROUTE_NAME.Symbols,
    hint: '@symbiote-native/symbols — SF Symbols on iOS, Material Symbols elsewhere: weight, scale, tint, animation',
  },
  {
    label: 'Apple Authentication',
    route: ROUTE_NAME.AppleAuthentication,
    hint: '@symbiote-native/apple-authentication — Sign in with Apple button, sign-in, credential state, revoke events',
  },
  {
    label: 'Image',
    route: ROUTE_NAME.Image,
    hint: '@symbiote-native/image — expo-image: caching, placeholders, blurhash, transitions, content fit, Image API and ImageBackground',
  },
  {
    label: 'Video',
    route: ROUTE_NAME.Video,
    hint: '@symbiote-native/video — player, native controls, fullscreen, PiP, thumbnails, cache, subtitles',
  },
  {
    label: 'Camera',
    route: ROUTE_NAME.Camera,
    hint: '@symbiote-native/camera — preview, photo, video recording, barcode scanning, zoom, torch, permissions',
  },
  {
    label: 'Live Photo',
    route: ROUTE_NAME.LivePhoto,
    hint: '@symbiote-native/live-photo — iOS only: play Live Photos from the library with a touch',
  },
  {
    label: 'GL',
    route: ROUTE_NAME.Gl,
    hint: '@symbiote-native/gl — GLView: raw WebGL context, shaders, textures from camera, snapshots',
  },
];

export function MenuScreen() {
  const navigation = useStackNavigation();
  return (
    <safe-area-view class="screen">
      <scroll-view
        testID="menu-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view class="menu-hero">
          <text class="menu-eyebrow">EXPO MODULES DEMOS</text>
          <text class="menu-hero-title">
            Expo-SDK ports on a real native stack
          </text>
          <text class="menu-hero-subtitle">
            Each row below demos a different @symbiote-native package built on
            expo-modules-core.
          </text>
        </view>
        <For each={MENU_ITEMS}>
          {item => {
            const lineInfo = ROUTE_LINE_INFO[item.route];
            return (
              <pressable
                testID={`menu-row-${item.route}`}
                class={`menu-row menu-row-${lineInfo.line}`}
                onPress={() => navigation().push(item.route)}
              >
                {() => (
                  <>
                    <view class={`menu-badge menu-badge-${lineInfo.line}`}>
                      <text class="menu-badge-text">{lineInfo.code}</text>
                    </view>
                    <view class="menu-row-copy">
                      <text class="menu-row-label">{item.label}</text>
                      <text
                        class={`menu-row-hint menu-row-hint-${lineInfo.line}`}
                      >
                        {item.hint}
                      </text>
                    </view>
                  </>
                )}
              </pressable>
            );
          }}
        </For>
      </scroll-view>
    </safe-area-view>
  );
}
