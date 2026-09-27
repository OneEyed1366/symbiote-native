import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  MotionActivityConfidence,
  MotionActivityType,
  geocodeAsync,
  getBackgroundPermissionsAsync,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  getHeadingAsync,
  getMotionActivityAsync,
  getMotionActivityPermissionsAsync,
  hasStartedLocationUpdatesAsync,
  requestBackgroundPermissionsAsync,
  requestForegroundPermissionsAsync,
  requestMotionActivityPermissionsAsync,
  reverseGeocodeAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
  watchPositionAsync,
} from '@symbiote-native/location';
import type {
  ILocationGeocodedAddress,
  ILocationGeocodedLocation,
  ILocationHeadingObject,
  ILocationObject,
  ILocationSubscription,
} from '@symbiote-native/location';
import { defineTask } from '@symbiote-native/task-manager';
import { ActionButton } from '../components/ActionButton';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ICapabilityStatus = 'checking' | 'yes' | 'no';

function toCapabilityStatus(value: boolean): ICapabilityStatus {
  return value ? 'yes' : 'no';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatNullable(value: number | null): string {
  return value === null ? '—' : String(value);
}

const MOTION_ACTIVITY_TYPES: readonly MotionActivityType[] = [
  MotionActivityType.Automotive,
  MotionActivityType.Cycling,
  MotionActivityType.Running,
  MotionActivityType.Walking,
  MotionActivityType.Stationary,
  MotionActivityType.Unknown,
];

function motionActivityLabel(type: MotionActivityType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function confidenceLabel(confidence: MotionActivityConfidence): string {
  switch (confidence) {
    case MotionActivityConfidence.Low:
      return 'Low';
    case MotionActivityConfidence.Medium:
      return 'Medium';
    case MotionActivityConfidence.High:
      return 'High';
    default:
      return 'Unknown';
  }
}

const GEOCODE_ADDRESS = '221B Baker Street, London';

// Task executors must be registered at module top level — outside any component — since the app
// can be launched headlessly to run one. See the @symbiote-native/task-manager README.
const BACKGROUND_LOCATION_TASK = 'expo-location-canary-demo';
defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.error('expo-location-canary-demo failed:', error);
    return;
  }
  console.log('expo-location-canary-demo received:', data);
});

type IPositionResultState =
  | { kind: 'success'; location: ILocationObject }
  | { kind: 'error'; message: string };

type IHeadingResultState =
  | { kind: 'success'; heading: ILocationHeadingObject }
  | { kind: 'error'; message: string };

type IDetectedActivity = {
  type: MotionActivityType;
  confidence: MotionActivityConfidence;
};

type IActivityResultState =
  | { kind: 'success'; detected: IDetectedActivity[] }
  | { kind: 'error'; message: string };

type IGeocodeResultState =
  | { kind: 'success'; location: ILocationGeocodedLocation }
  | { kind: 'error'; message: string };

type IReverseGeocodeResultState =
  | { kind: 'success'; address: ILocationGeocodedAddress }
  | { kind: 'error'; message: string };

/**
 * @symbiote-native/location canary demo: permissions (foreground/background/motion), a one-shot +
 * watched current position, heading, motion activity, geocoding/reverse-geocoding, and a
 * background-location task registered via @symbiote-native/task-manager's defineTask. No Angular
 * service wrapper exists for this package yet (unlike SensorsScreen/KeepAwakeScreen's *Service) —
 * every call below is a plain async function off the core package, same imperative shape as
 * LocalAuthScreen/SecureStoreScreen. iOS Simulator has no real GPS but supports simulated location
 * (Features → Location); Android emulator location is set via Extended Controls → Location.
 *
 * The "Foreground service" toggle passes `foregroundService` to startLocationUpdatesAsync, which
 * on Android promotes the task to a real foreground service (a persistent notification, exempt
 * from Doze) instead of a plain background task. That needs FOREGROUND_SERVICE and
 * FOREGROUND_SERVICE_LOCATION declared in the app's own AndroidManifest.xml — this canary's
 * native-link.json deliberately leaves @symbiote-native/location's own
 * isAndroidForegroundServiceEnabled unset (see its README), so on Android a start with the toggle
 * on is expected to reject with a SecurityException, not a bug either.
 */
@Component({
  selector: 'LocationScreen',
  standalone: true,
  imports: [ActionButton, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="location-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="lineTagClass">
          <text class="line-tag-text">{{ lineTagLabel }}</text>
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="heroBadgeStyle">
            <text class="hero-badge-text">{{ heroBadgeCode }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Location</text>
            <text class="hero-body">
              @symbiote-native/location — foreground/background position,
              heading, geocoding, and motion activity. iOS Simulator has no real
              GPS but supports simulated location (Features → Location); Android
              emulator location is set via Extended Controls → Location.
            </text>
          </view>
        </view>

        <view testID="location-permissions-card" class="capability-card">
          <text class="capability-card-title">Permissions</text>

          <view testID="location-foreground-row" class="capability-row">
            <text class="capability-label">Foreground</text>
            <view [class]="statusBadgeClass(foregroundPermissionStatus())">
              <text class="status-badge-text">{{
                statusLabel(foregroundPermissionStatus())
              }}</text>
            </view>
          </view>
          <ActionButton
            testID="location-request-foreground-button"
            title="Request foreground"
            (press)="requestForeground()"
            [color]="lineColor"
          ></ActionButton>

          <view testID="location-background-row" class="capability-row">
            <text class="capability-label">Background</text>
            <view [class]="statusBadgeClass(backgroundPermissionStatus())">
              <text class="status-badge-text">{{
                statusLabel(backgroundPermissionStatus())
              }}</text>
            </view>
          </view>
          <ActionButton
            testID="location-request-background-button"
            title="Request background"
            (press)="requestBackground()"
            [color]="lineColor"
          ></ActionButton>

          <view testID="location-motion-row" class="capability-row">
            <text class="capability-label">Motion</text>
            <view [class]="statusBadgeClass(motionPermissionStatus())">
              <text class="status-badge-text">{{
                statusLabel(motionPermissionStatus())
              }}</text>
            </view>
          </view>
          <ActionButton
            testID="location-request-motion-button"
            title="Request motion"
            (press)="requestMotion()"
            [color]="lineColor"
          ></ActionButton>
        </view>

        <view testID="location-position-card" class="capability-card">
          <text class="capability-card-title">Position</text>
          <ActionButton
            testID="location-get-position-button"
            title="Get current position"
            (press)="getPosition()"
            [color]="lineColor"
          ></ActionButton>
          <view class="capability-row">
            <text class="capability-label">Watching</text>
            <view
              testID="location-watching-status"
              [class]="watchingBadgeClass()"
            >
              <text class="status-badge-text">{{ watchingLabel() }}</text>
            </view>
          </view>
          <ActionButton
            testID="location-watch-toggle-button"
            [title]="watchToggleTitle()"
            (press)="toggleWatch()"
            [color]="lineColor"
          ></ActionButton>
          @if (positionResult(); as result) {
            <view
              testID="location-position-result"
              [class]="resultClass(result.kind)"
            >
              @if (result.kind === 'success') {
                <view class="sensor-reading-row">
                  <view class="sensor-reading-chip">
                    <text class="sensor-reading-label">LAT</text>
                    <text class="sensor-reading-value">{{
                      result.location.coords.latitude
                    }}</text>
                  </view>
                  <view class="sensor-reading-chip">
                    <text class="sensor-reading-label">LON</text>
                    <text class="sensor-reading-value">{{
                      result.location.coords.longitude
                    }}</text>
                  </view>
                </view>
                <view class="sensor-reading-row">
                  <view class="sensor-reading-chip">
                    <text class="sensor-reading-label">ALT</text>
                    <text class="sensor-reading-value">{{
                      formatNullable(result.location.coords.altitude)
                    }}</text>
                  </view>
                  <view class="sensor-reading-chip">
                    <text class="sensor-reading-label">ACC</text>
                    <text class="sensor-reading-value">{{
                      formatNullable(result.location.coords.accuracy)
                    }}</text>
                  </view>
                </view>
                <view class="sensor-reading-row">
                  <view class="sensor-reading-chip">
                    <text class="sensor-reading-label">HDG</text>
                    <text class="sensor-reading-value">{{
                      formatNullable(result.location.coords.heading)
                    }}</text>
                  </view>
                  <view class="sensor-reading-chip">
                    <text class="sensor-reading-label">SPD</text>
                    <text class="sensor-reading-value">{{
                      formatNullable(result.location.coords.speed)
                    }}</text>
                  </view>
                </view>
                <text class="auth-result-text">{{
                  timestampLabel(result.location.timestamp)
                }}</text>
              } @else {
                <text class="auth-result-text">{{ result.message }}</text>
              }
            </view>
          }
        </view>

        <view testID="location-heading-card" class="capability-card">
          <text class="capability-card-title">Heading</text>
          <ActionButton
            testID="location-get-heading-button"
            title="Get heading"
            (press)="getHeading()"
            [color]="lineColor"
          ></ActionButton>
          @if (headingResult(); as result) {
            <view
              testID="location-heading-result"
              [class]="resultClass(result.kind)"
            >
              @if (result.kind === 'success') {
                <view class="sensor-reading-row">
                  <view class="sensor-reading-chip">
                    <text class="sensor-reading-label">TRUE</text>
                    <text class="sensor-reading-value">{{
                      result.heading.trueHeading
                    }}</text>
                  </view>
                  <view class="sensor-reading-chip">
                    <text class="sensor-reading-label">MAG</text>
                    <text class="sensor-reading-value">{{
                      result.heading.magHeading
                    }}</text>
                  </view>
                  <view class="sensor-reading-chip">
                    <text class="sensor-reading-label">ACC</text>
                    <text class="sensor-reading-value">{{
                      result.heading.accuracy
                    }}</text>
                  </view>
                </view>
              } @else {
                <text class="auth-result-text">{{ result.message }}</text>
              }
            </view>
          }
        </view>

        <view testID="location-activity-card" class="capability-card">
          <text class="capability-card-title">Motion activity</text>
          <ActionButton
            testID="location-get-activity-button"
            title="Get current activity"
            (press)="getActivity()"
            [color]="lineColor"
          ></ActionButton>
          @if (activityResult(); as result) {
            <view
              testID="location-activity-result"
              [class]="resultClass(result.kind)"
            >
              @if (result.kind === 'success') {
                @if (result.detected.length === 0) {
                  <text class="auth-result-text">No activity detected</text>
                } @else {
                  @for (activity of result.detected; track activity.type) {
                    <view class="capability-row">
                      <text class="capability-label">{{
                        activityTypeLabel(activity.type)
                      }}</text>
                      <text class="value-text">{{
                        activityConfidenceLabel(activity.confidence)
                      }}</text>
                    </view>
                  }
                }
              } @else {
                <text class="auth-result-text">{{ result.message }}</text>
              }
            </view>
          }
        </view>

        <view testID="location-geocode-card" class="capability-card">
          <text class="capability-card-title">Geocoding</text>
          <text class="capability-label">{{ geocodeAddress }}</text>
          <ActionButton
            testID="location-geocode-button"
            title="Geocode address"
            (press)="geocodeAddressAction()"
            [color]="lineColor"
          ></ActionButton>
          @if (geocodeResult(); as result) {
            <view
              testID="location-geocode-result"
              [class]="resultClass(result.kind)"
            >
              <text class="auth-result-text">{{
                result.kind === 'success'
                  ? geocodeSuccessLabel(result.location)
                  : result.message
              }}</text>
            </view>
          }
          <ActionButton
            testID="location-reverse-geocode-button"
            title="Reverse geocode last position"
            (press)="reverseGeocodeLastPosition()"
            [color]="lineColor"
          ></ActionButton>
          @if (reverseGeocodeResult(); as result) {
            <view
              testID="location-reverse-geocode-result"
              [class]="resultClass(result.kind)"
            >
              <text class="auth-result-text">{{
                result.kind === 'success'
                  ? reverseGeocodeSuccessLabel(result.address)
                  : result.message
              }}</text>
            </view>
          }
        </view>

        <view testID="location-background-card" class="capability-card">
          <text class="capability-card-title">Background location</text>
          <view class="capability-row">
            <text class="capability-label">Registered</text>
            <view
              testID="location-background-registered-status"
              [class]="statusBadgeClass(backgroundRegisteredStatus())"
            >
              <text class="status-badge-text">{{
                statusLabel(backgroundRegisteredStatus())
              }}</text>
            </view>
          </view>
          <view class="capability-row">
            <text class="capability-label">Foreground service</text>
            <view
              testID="location-foreground-service-status"
              [class]="statusBadgeClass(useForegroundService() ? 'yes' : 'no')"
            >
              <text class="status-badge-text">{{
                useForegroundService() ? 'ON' : 'OFF'
              }}</text>
            </view>
          </view>
          <ActionButton
            testID="location-foreground-service-toggle"
            [title]="useForegroundService() ? 'Turn off' : 'Turn on'"
            (press)="toggleForegroundService()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="location-start-background-button"
            title="Start"
            (press)="startBackgroundLocation()"
            [color]="lineColor"
          ></ActionButton>
          <ActionButton
            testID="location-stop-background-button"
            title="Stop"
            (press)="stopBackgroundLocation()"
            [color]="lineColor"
          ></ActionButton>
          @if (backgroundError(); as message) {
            <view class="auth-result auth-result-error">
              <text class="auth-result-text">{{ message }}</text>
            </view>
          }
        </view>
      </scroll-view>
    </safe-area-view>
  `,
})
export class LocationScreen implements OnInit, OnDestroy {
  private readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Location];
  readonly lineTagClass = `line-tag line-tag-${this.lineInfo.line}`;
  readonly lineTagLabel = `${this.lineInfo.code} · ${this.lineInfo.label}`;
  readonly heroBadgeCode = this.lineInfo.code;
  readonly lineColor = LINE_COLOR[this.lineInfo.line];
  readonly heroBadgeStyle = { backgroundColor: this.lineColor };
  readonly geocodeAddress = GEOCODE_ADDRESS;

  readonly formatNullable = formatNullable;
  readonly activityTypeLabel = motionActivityLabel;
  readonly activityConfidenceLabel = confidenceLabel;

  readonly foregroundPermissionStatus = signal<ICapabilityStatus>('checking');
  readonly backgroundPermissionStatus = signal<ICapabilityStatus>('checking');
  readonly motionPermissionStatus = signal<ICapabilityStatus>('checking');
  readonly backgroundRegisteredStatus = signal<ICapabilityStatus>('checking');

  readonly isWatching = signal(false);
  private watchSubscription: ILocationSubscription | null = null;
  private readonly lastLocation = signal<ILocationObject | null>(null);

  readonly positionResult = signal<IPositionResultState | null>(null);
  readonly headingResult = signal<IHeadingResultState | null>(null);
  readonly activityResult = signal<IActivityResultState | null>(null);
  readonly geocodeResult = signal<IGeocodeResultState | null>(null);
  readonly reverseGeocodeResult = signal<IReverseGeocodeResultState | null>(
    null,
  );
  readonly backgroundError = signal<string | null>(null);
  readonly useForegroundService = signal(false);

  ngOnInit(): void {
    void this.refreshForegroundPermission();
    void this.refreshBackgroundPermission();
    void this.refreshMotionPermission();
    void this.refreshBackgroundRegistered();
  }

  ngOnDestroy(): void {
    this.watchSubscription?.remove();
  }

  private async refreshForegroundPermission(): Promise<void> {
    try {
      const response = await getForegroundPermissionsAsync();
      this.foregroundPermissionStatus.set(toCapabilityStatus(response.granted));
    } catch {
      this.foregroundPermissionStatus.set('no');
    }
  }

  private async refreshBackgroundPermission(): Promise<void> {
    try {
      const response = await getBackgroundPermissionsAsync();
      this.backgroundPermissionStatus.set(toCapabilityStatus(response.granted));
    } catch {
      this.backgroundPermissionStatus.set('no');
    }
  }

  private async refreshMotionPermission(): Promise<void> {
    try {
      const response = await getMotionActivityPermissionsAsync();
      this.motionPermissionStatus.set(toCapabilityStatus(response.granted));
    } catch {
      this.motionPermissionStatus.set('no');
    }
  }

  private async refreshBackgroundRegistered(): Promise<void> {
    try {
      const registered = await hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK,
      );
      this.backgroundRegisteredStatus.set(toCapabilityStatus(registered));
    } catch {
      this.backgroundRegisteredStatus.set('no');
    }
  }

  async requestForeground(): Promise<void> {
    try {
      const response = await requestForegroundPermissionsAsync();
      this.foregroundPermissionStatus.set(toCapabilityStatus(response.granted));
    } catch {
      this.foregroundPermissionStatus.set('no');
    }
  }

  async requestBackground(): Promise<void> {
    try {
      const response = await requestBackgroundPermissionsAsync();
      this.backgroundPermissionStatus.set(toCapabilityStatus(response.granted));
    } catch {
      this.backgroundPermissionStatus.set('no');
    }
  }

  async requestMotion(): Promise<void> {
    try {
      const response = await requestMotionActivityPermissionsAsync();
      this.motionPermissionStatus.set(toCapabilityStatus(response.granted));
    } catch {
      this.motionPermissionStatus.set('no');
    }
  }

  async getPosition(): Promise<void> {
    try {
      const location = await getCurrentPositionAsync();
      this.lastLocation.set(location);
      this.positionResult.set({ kind: 'success', location });
    } catch (error) {
      this.positionResult.set({ kind: 'error', message: errorMessage(error) });
    }
  }

  async toggleWatch(): Promise<void> {
    if (this.isWatching()) {
      this.watchSubscription?.remove();
      this.watchSubscription = null;
      this.isWatching.set(false);
      return;
    }
    try {
      this.watchSubscription = await watchPositionAsync(
        {},
        location => {
          this.lastLocation.set(location);
          this.positionResult.set({ kind: 'success', location });
        },
        reason => {
          this.positionResult.set({ kind: 'error', message: reason });
        },
      );
      this.isWatching.set(true);
    } catch (error) {
      this.positionResult.set({ kind: 'error', message: errorMessage(error) });
    }
  }

  async getHeading(): Promise<void> {
    try {
      const heading = await getHeadingAsync();
      this.headingResult.set({ kind: 'success', heading });
    } catch (error) {
      this.headingResult.set({ kind: 'error', message: errorMessage(error) });
    }
  }

  async getActivity(): Promise<void> {
    try {
      const activity = await getMotionActivityAsync();
      const detected = MOTION_ACTIVITY_TYPES.filter(
        type => activity.activities[type].detected,
      ).map(type => ({
        type,
        confidence: activity.activities[type].confidence,
      }));
      this.activityResult.set({ kind: 'success', detected });
    } catch (error) {
      this.activityResult.set({ kind: 'error', message: errorMessage(error) });
    }
  }

  async geocodeAddressAction(): Promise<void> {
    try {
      const results = await geocodeAsync(GEOCODE_ADDRESS);
      const first = results[0];
      if (!first) {
        this.geocodeResult.set({ kind: 'error', message: 'No results' });
        return;
      }
      this.geocodeResult.set({ kind: 'success', location: first });
    } catch (error) {
      this.geocodeResult.set({ kind: 'error', message: errorMessage(error) });
    }
  }

  async reverseGeocodeLastPosition(): Promise<void> {
    const location = this.lastLocation();
    if (!location) {
      this.reverseGeocodeResult.set({
        kind: 'error',
        message: 'No position fetched yet — use "Get current position" first.',
      });
      return;
    }
    try {
      const results = await reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      const first = results[0];
      if (!first) {
        this.reverseGeocodeResult.set({
          kind: 'error',
          message: 'No results',
        });
        return;
      }
      this.reverseGeocodeResult.set({ kind: 'success', address: first });
    } catch (error) {
      this.reverseGeocodeResult.set({
        kind: 'error',
        message: errorMessage(error),
      });
    }
  }

  toggleForegroundService(): void {
    this.useForegroundService.set(!this.useForegroundService());
  }

  async startBackgroundLocation(): Promise<void> {
    try {
      await startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        distanceInterval: 100,
        ...(this.useForegroundService()
          ? {
              foregroundService: {
                notificationTitle: 'Location canary',
                notificationBody: 'Tracking your position in the background.',
              },
            }
          : {}),
      });
      this.backgroundError.set(null);
    } catch (error) {
      this.backgroundError.set(errorMessage(error));
    }
    await this.refreshBackgroundRegistered();
  }

  async stopBackgroundLocation(): Promise<void> {
    try {
      await stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      this.backgroundError.set(null);
    } catch (error) {
      this.backgroundError.set(errorMessage(error));
    }
    await this.refreshBackgroundRegistered();
  }

  geocodeSuccessLabel(location: ILocationGeocodedLocation): string {
    return `Lat ${location.latitude}, Lng ${location.longitude}`;
  }

  reverseGeocodeSuccessLabel(address: ILocationGeocodedAddress): string {
    const city = address.city ?? '—';
    const country = address.country ?? '—';
    const formatted = address.formattedAddress ?? '—';
    return `${city}, ${country} · ${formatted}`;
  }

  timestampLabel(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  watchingBadgeClass(): string {
    return `status-badge ${
      this.isWatching() ? 'status-badge-yes' : 'status-badge-no'
    }`;
  }

  watchingLabel(): string {
    return this.isWatching() ? 'WATCHING' : 'NOT WATCHING';
  }

  watchToggleTitle(): string {
    return this.isWatching() ? 'Stop watching' : 'Start watching';
  }

  resultClass(kind: 'success' | 'error'): string {
    return `auth-result auth-result-${kind}`;
  }

  statusBadgeClass(status: ICapabilityStatus): string {
    return `status-badge status-badge-${status}`;
  }

  statusLabel(status: ICapabilityStatus): string {
    return status === 'checking'
      ? 'CHECKING…'
      : status === 'yes'
        ? 'YES'
        : 'NO';
  }
}
