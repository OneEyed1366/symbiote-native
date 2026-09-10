import { computed, defineComponent, onMounted, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { ScrollView } from '@symbiote-native/vue';
import {
  useAccelerometer,
  useDeviceMotion,
  useGyroscope,
  useMagnetometer,
  usePedometer,
} from '@symbiote-native/sensors/vue';
import {
  Accelerometer,
  DeviceMotion,
  Gyroscope,
  Magnetometer,
  isAvailableAsync as isPedometerAvailableAsync,
} from '@symbiote-native/sensors';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

type ISensorAvailability = 'checking' | 'unavailable' | 'available';
type ISensorStatus = 'checking' | 'unavailable' | 'waiting' | 'live';

const SENSOR_STATUS_TEXT: Record<ISensorStatus, string> = {
  checking: 'CHECKING…',
  unavailable: 'UNAVAILABLE',
  waiting: 'WAITING…',
  live: 'LIVE',
};

// Resolves once per sensor on mount — kept separate from the live-measurement ref (useX()
// composables from @symbiote-native/sensors/vue) so the screen can tell "not available on this
// device" apart from "available, no reading yet": 'checking' means the isAvailableAsync() check
// is still in flight.
function useSensorAvailability(
  checkAvailable: () => Promise<boolean>,
): Ref<ISensorAvailability> {
  const availability = ref<ISensorAvailability>('checking');

  onMounted(() => {
    checkAvailable().then(available => {
      availability.value = available ? 'available' : 'unavailable';
    });
  });

  return availability;
}

function sensorStatus(
  availability: Ref<ISensorAvailability>,
  hasReading: () => boolean,
): ComputedRef<ISensorStatus> {
  return computed(() => {
    if (availability.value === 'checking') return 'checking';
    if (availability.value === 'unavailable') return 'unavailable';
    return hasReading() ? 'live' : 'waiting';
  });
}

function renderSensorBody(status: ISensorStatus, children: () => unknown) {
  if (status === 'checking')
    return <text class="info-text">checking availability…</text>;
  if (status === 'unavailable')
    return <text class="info-text">not available on this device</text>;
  if (status === 'waiting')
    return <text class="info-text">waiting for first reading…</text>;
  return children();
}

function renderAxisRow(measurement: { x: number; y: number; z: number }) {
  return (
    <view class="sensor-reading-row">
      <view class="sensor-reading-chip">
        <text class="sensor-reading-label">X</text>
        <text class="sensor-reading-value">{measurement.x.toFixed(3)}</text>
      </view>
      <view class="sensor-reading-chip">
        <text class="sensor-reading-label">Y</text>
        <text class="sensor-reading-value">{measurement.y.toFixed(3)}</text>
      </view>
      <view class="sensor-reading-chip">
        <text class="sensor-reading-label">Z</text>
        <text class="sensor-reading-value">{measurement.z.toFixed(3)}</text>
      </view>
    </view>
  );
}

/**
 * Sensors demo: one card per @symbiote-native/sensors composable — Accelerometer, Gyroscope,
 * Magnetometer, DeviceMotion, Pedometer — each independently resolving isAvailableAsync() and
 * subscribing to live readings. iOS Simulator genuinely reports every CoreMotion/CMPedometer
 * sensor as unavailable (no real IMU/pedometer hardware) — that's expected, verify on a real
 * device to see live readings. Vue TSX twin of ../../react/screens/SensorsScreen.tsx — same
 * 4-state card (checking/unavailable/waiting/live) and X/Y/Z reading-chip layout, React being
 * this repo's "prove the pattern first" adapter for this package.
 */
export const SensorsScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

    const accelerometer = useAccelerometer();
    const accelerometerAvailability = useSensorAvailability(() =>
      Accelerometer.isAvailableAsync(),
    );
    const accelerometerStatus = sensorStatus(
      accelerometerAvailability,
      () => accelerometer.value !== null,
    );

    const gyroscope = useGyroscope();
    const gyroscopeAvailability = useSensorAvailability(() =>
      Gyroscope.isAvailableAsync(),
    );
    const gyroscopeStatus = sensorStatus(
      gyroscopeAvailability,
      () => gyroscope.value !== null,
    );

    const magnetometer = useMagnetometer();
    const magnetometerAvailability = useSensorAvailability(() =>
      Magnetometer.isAvailableAsync(),
    );
    const magnetometerStatus = sensorStatus(
      magnetometerAvailability,
      () => magnetometer.value !== null,
    );

    const deviceMotion = useDeviceMotion();
    const deviceMotionAvailability = useSensorAvailability(() =>
      DeviceMotion.isAvailableAsync(),
    );
    const deviceMotionStatus = sensorStatus(
      deviceMotionAvailability,
      () => deviceMotion.value !== null,
    );

    const pedometer = usePedometer();
    const pedometerAvailability = useSensorAvailability(() =>
      isPedometerAvailableAsync(),
    );
    const pedometerStatus = sensorStatus(
      pedometerAvailability,
      () => pedometer.value !== null,
    );

    return () => (
      <safe-area-view class="screen">
        <ScrollView
          testID="sensors-scroll"
          class="screen"
          contentContainerStyle="scroll-content"
        >
          <view class={`line-tag line-tag-${lineInfo.line}`}>
            <text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</text>
          </view>
          <view class="hero-card">
            <view
              class="hero-badge"
              style={{ backgroundColor: LINE_COLOR.sensors }}
            >
              <text class="hero-badge-text">{lineInfo.code}</text>
            </view>
            <view class="hero-copy">
              <text class="hero-title">Sensors</text>
              <text class="hero-body">
                @symbiote-native/sensors — live readings from five
                expo-sensors-backed hooks. A simulator reports every
                CoreMotion/CMPedometer-backed sensor as unavailable; a real
                device is needed to see live readings.
              </text>
            </view>
          </view>

          <view class="sensor-card" testID="sensor-card-accelerometer">
            <view class="sensor-card-header">
              <text class="sensor-card-title">Accelerometer</text>
              <view
                class={`sensor-status-badge sensor-status-badge-${accelerometerStatus.value}`}
              >
                <text class="sensor-status-text">
                  {SENSOR_STATUS_TEXT[accelerometerStatus.value]}
                </text>
              </view>
            </view>
            {renderSensorBody(
              accelerometerStatus.value,
              () => accelerometer.value && renderAxisRow(accelerometer.value),
            )}
          </view>

          <view class="sensor-card" testID="sensor-card-gyroscope">
            <view class="sensor-card-header">
              <text class="sensor-card-title">Gyroscope</text>
              <view
                class={`sensor-status-badge sensor-status-badge-${gyroscopeStatus.value}`}
              >
                <text class="sensor-status-text">
                  {SENSOR_STATUS_TEXT[gyroscopeStatus.value]}
                </text>
              </view>
            </view>
            {renderSensorBody(
              gyroscopeStatus.value,
              () => gyroscope.value && renderAxisRow(gyroscope.value),
            )}
          </view>

          <view class="sensor-card" testID="sensor-card-magnetometer">
            <view class="sensor-card-header">
              <text class="sensor-card-title">Magnetometer</text>
              <view
                class={`sensor-status-badge sensor-status-badge-${magnetometerStatus.value}`}
              >
                <text class="sensor-status-text">
                  {SENSOR_STATUS_TEXT[magnetometerStatus.value]}
                </text>
              </view>
            </view>
            {renderSensorBody(
              magnetometerStatus.value,
              () => magnetometer.value && renderAxisRow(magnetometer.value),
            )}
          </view>

          <view class="sensor-card" testID="sensor-card-device-motion">
            <view class="sensor-card-header">
              <text class="sensor-card-title">Device motion</text>
              <view
                class={`sensor-status-badge sensor-status-badge-${deviceMotionStatus.value}`}
              >
                <text class="sensor-status-text">
                  {SENSOR_STATUS_TEXT[deviceMotionStatus.value]}
                </text>
              </view>
            </view>
            {renderSensorBody(deviceMotionStatus.value, () => {
              const motion = deviceMotion.value;
              if (!motion) return null;
              return [
                <text class="info-text">{`interval: ${motion.interval.toFixed(1)}ms`}</text>,
                motion.rotation && (
                  <view class="sensor-reading-row">
                    <view class="sensor-reading-chip">
                      <text class="sensor-reading-label">ALPHA</text>
                      <text class="sensor-reading-value">
                        {motion.rotation.alpha.toFixed(3)}
                      </text>
                    </view>
                    <view class="sensor-reading-chip">
                      <text class="sensor-reading-label">BETA</text>
                      <text class="sensor-reading-value">
                        {motion.rotation.beta.toFixed(3)}
                      </text>
                    </view>
                    <view class="sensor-reading-chip">
                      <text class="sensor-reading-label">GAMMA</text>
                      <text class="sensor-reading-value">
                        {motion.rotation.gamma.toFixed(3)}
                      </text>
                    </view>
                  </view>
                ),
              ];
            })}
          </view>

          <view class="sensor-card" testID="sensor-card-pedometer">
            <view class="sensor-card-header">
              <text class="sensor-card-title">Pedometer</text>
              <view
                class={`sensor-status-badge sensor-status-badge-${pedometerStatus.value}`}
              >
                <text class="sensor-status-text">
                  {SENSOR_STATUS_TEXT[pedometerStatus.value]}
                </text>
              </view>
            </view>
            {renderSensorBody(
              pedometerStatus.value,
              () =>
                pedometer.value && (
                  <text
                    testID="sensors-pedometer-steps"
                    class="sensor-reading-value"
                  >
                    {`${pedometer.value.steps} steps`}
                  </text>
                ),
            )}
          </view>
        </ScrollView>
      </safe-area-view>
    );
  },
  { name: 'SensorsScreen' },
);
