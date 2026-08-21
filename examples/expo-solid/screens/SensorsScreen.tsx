import { Show, createSignal, onCleanup, type Accessor, type JSX } from 'solid-js';
import { SafeAreaView, ScrollView, Text, View } from '@symbiote-native/solid';
import {
  Accelerometer,
  DeviceMotion,
  Gyroscope,
  Magnetometer,
  isAvailableAsync as isPedometerAvailableAsync,
  type IAccelerometerMeasurement,
  type IDeviceMotionMeasurement,
  type IGyroscopeMeasurement,
  type IMagnetometerMeasurement,
  type IPedometerResult,
} from '@symbiote-native/sensors';
import {
  createAccelerometer,
  createDeviceMotion,
  createGyroscope,
  createMagnetometer,
  createPedometer,
} from '@symbiote-native/sensors/solid';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Pedometer has no shared singleton upstream (see packages/sensors' core/pedometer.ts) - wrapped
// in a stable module-level object, same as examples/expo-react.
const PEDOMETER_SENSOR = { isAvailableAsync: isPedometerAvailableAsync };

type ISensorAvailability = 'checking' | 'available' | 'unavailable';
type ISensorStatus = 'checking' | 'unavailable' | 'waiting' | 'live';

const SENSOR_STATUS_TEXT: Record<ISensorStatus, string> = {
  checking: 'CHECKING…',
  unavailable: 'UNAVAILABLE',
  waiting: 'WAITING…',
  live: 'LIVE',
};

// isAvailableAsync() is a separate call from the live-reading primitive - a sensor can be
// "unavailable" (iOS Simulator, every CoreMotion/CMPedometer-backed sensor) or "waiting for a
// first reading" (available, subscribed, native hasn't reported yet); rendering both as the same
// blank state would hide a real bug behind expected simulator behavior. Subscribes SYNCHRONOUSLY
// in the body, guarded by onCleanup - a Solid component body runs once, so this call site IS the
// subscription point, not an effect that would re-fire on every render.
function createSensorAvailability(sensor: {
  isAvailableAsync: () => Promise<boolean>;
}): Accessor<ISensorAvailability> {
  const [availability, setAvailability] =
    createSignal<ISensorAvailability>('checking');

  let disposed = false;
  onCleanup(() => {
    disposed = true;
  });
  sensor.isAvailableAsync().then(isAvailable => {
    if (!disposed) {
      setAvailability(isAvailable ? 'available' : 'unavailable');
    }
  });

  return availability;
}

function resolveSensorStatus(
  availability: ISensorAvailability,
  hasReading: boolean,
): ISensorStatus {
  if (availability === 'checking') {
    return 'checking';
  }
  if (availability === 'unavailable') {
    return 'unavailable';
  }
  return hasReading ? 'live' : 'waiting';
}

function SensorStatusBadge(props: { status: ISensorStatus }) {
  return (
    <View class={`sensor-status-badge sensor-status-badge-${props.status}`}>
      <Text class="sensor-status-text">
        {SENSOR_STATUS_TEXT[props.status]}
      </Text>
    </View>
  );
}

function SensorCard(props: {
  testID: string;
  title: string;
  status: ISensorStatus;
  children?: JSX.Element;
}) {
  return (
    <View testID={props.testID} class="sensor-card">
      <View class="sensor-card-header">
        <Text class="sensor-card-title">{props.title}</Text>
        <SensorStatusBadge status={props.status} />
      </View>
      {props.status === 'checking' && (
        <Text class="info-text">checking availability…</Text>
      )}
      {props.status === 'unavailable' && (
        <Text class="info-text">not available on this device</Text>
      )}
      {props.status === 'waiting' && (
        <Text class="info-text">waiting for first reading…</Text>
      )}
      {props.status === 'live' && props.children}
    </View>
  );
}

function AxisReadingRow(props: {
  measurement: { x: number; y: number; z: number };
}) {
  return (
    <View class="sensor-reading-row">
      <View class="sensor-reading-chip">
        <Text class="sensor-reading-label">X</Text>
        <Text class="sensor-reading-value">
          {props.measurement.x.toFixed(3)}
        </Text>
      </View>
      <View class="sensor-reading-chip">
        <Text class="sensor-reading-label">Y</Text>
        <Text class="sensor-reading-value">
          {props.measurement.y.toFixed(3)}
        </Text>
      </View>
      <View class="sensor-reading-chip">
        <Text class="sensor-reading-label">Z</Text>
        <Text class="sensor-reading-value">
          {props.measurement.z.toFixed(3)}
        </Text>
      </View>
    </View>
  );
}

/**
 * @symbiote-native/sensors canary demo: one card per primitive - Accelerometer, Gyroscope,
 * Magnetometer, DeviceMotion, Pedometer - each rendering its own checking/unavailable/waiting/
 * live state distinctly (SensorCard above), never conflating "still checking" with "no reading
 * yet" or "not available on this device". The iOS Simulator genuinely reports every
 * CoreMotion/CMPedometer-backed sensor as unavailable - expected, not a wiring bug.
 *
 * DeviceMotion's nested `rotation` field is guarded at the field itself
 * (`deviceMotion()?.rotation && ...`), not just at the top-level `deviceMotion()` read - the
 * underlying native sensor can report its first event before `rotation` is populated.
 */
export function SensorsScreen() {
  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

  const accelerometer = createAccelerometer();
  const accelerometerAvailability = createSensorAvailability(Accelerometer);
  const accelerometerStatus = () =>
    resolveSensorStatus(accelerometerAvailability(), accelerometer() !== null);

  const gyroscope = createGyroscope();
  const gyroscopeAvailability = createSensorAvailability(Gyroscope);
  const gyroscopeStatus = () =>
    resolveSensorStatus(gyroscopeAvailability(), gyroscope() !== null);

  const magnetometer = createMagnetometer();
  const magnetometerAvailability = createSensorAvailability(Magnetometer);
  const magnetometerStatus = () =>
    resolveSensorStatus(magnetometerAvailability(), magnetometer() !== null);

  const deviceMotion = createDeviceMotion();
  const deviceMotionAvailability = createSensorAvailability(DeviceMotion);
  const deviceMotionStatus = () =>
    resolveSensorStatus(deviceMotionAvailability(), deviceMotion() !== null);

  const pedometer = createPedometer();
  const pedometerAvailability = createSensorAvailability(PEDOMETER_SENSOR);
  const pedometerStatus = () =>
    resolveSensorStatus(pedometerAvailability(), pedometer() !== null);

  return (
    <SafeAreaView class="screen">
      <ScrollView
        testID="sensors-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <View class={`line-tag line-tag-${lineInfo.line}`}>
          <Text class="line-tag-text">{`${lineInfo.code} · ${lineInfo.label}`}</Text>
        </View>
        <View class="hero-card">
          <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.sensors }}>
            <Text class="hero-badge-text">{lineInfo.code}</Text>
          </View>
          <View class="hero-copy">
            <Text class="hero-title">Sensors</Text>
            <Text class="hero-body">
              @symbiote-native/sensors — live readings from five
              expo-sensors-backed primitives. A simulator reports every
              CoreMotion/CMPedometer-backed sensor as unavailable; a real
              device is needed to see live readings.
            </Text>
          </View>
        </View>

        <SensorCard
          testID="sensors-accelerometer"
          title="Accelerometer"
          status={accelerometerStatus()}
        >
          <Show when={accelerometer()}>
            {(measurement: Accessor<IAccelerometerMeasurement>) => (
              <AxisReadingRow measurement={measurement()} />
            )}
          </Show>
        </SensorCard>

        <SensorCard
          testID="sensors-gyroscope"
          title="Gyroscope"
          status={gyroscopeStatus()}
        >
          <Show when={gyroscope()}>
            {(measurement: Accessor<IGyroscopeMeasurement>) => (
              <AxisReadingRow measurement={measurement()} />
            )}
          </Show>
        </SensorCard>

        <SensorCard
          testID="sensors-magnetometer"
          title="Magnetometer"
          status={magnetometerStatus()}
        >
          <Show when={magnetometer()}>
            {(measurement: Accessor<IMagnetometerMeasurement>) => (
              <AxisReadingRow measurement={measurement()} />
            )}
          </Show>
        </SensorCard>

        <SensorCard
          testID="sensors-device-motion"
          title="Device motion"
          status={deviceMotionStatus()}
        >
          <Show when={deviceMotion()}>
            {(motion: Accessor<IDeviceMotionMeasurement>) => (
              <Text class="info-text">{`interval: ${motion().interval.toFixed(1)}ms`}</Text>
            )}
          </Show>
          <Show when={deviceMotion()?.rotation}>
            {(rotation: Accessor<IDeviceMotionMeasurement['rotation']>) => (
              <View class="sensor-reading-row">
                <View class="sensor-reading-chip">
                  <Text class="sensor-reading-label">ALPHA</Text>
                  <Text class="sensor-reading-value">
                    {rotation().alpha.toFixed(3)}
                  </Text>
                </View>
                <View class="sensor-reading-chip">
                  <Text class="sensor-reading-label">BETA</Text>
                  <Text class="sensor-reading-value">
                    {rotation().beta.toFixed(3)}
                  </Text>
                </View>
                <View class="sensor-reading-chip">
                  <Text class="sensor-reading-label">GAMMA</Text>
                  <Text class="sensor-reading-value">
                    {rotation().gamma.toFixed(3)}
                  </Text>
                </View>
              </View>
            )}
          </Show>
        </SensorCard>

        <SensorCard
          testID="sensors-pedometer"
          title="Pedometer"
          status={pedometerStatus()}
        >
          <Show when={pedometer()}>
            {(reading: Accessor<IPedometerResult>) => (
              <Text testID="sensors-pedometer-steps" class="sensor-reading-value">
                {`${reading().steps} steps`}
              </Text>
            )}
          </Show>
        </SensorCard>
      </ScrollView>
    </SafeAreaView>
  );
}
