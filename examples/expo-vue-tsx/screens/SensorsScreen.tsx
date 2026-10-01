import { computed, defineComponent, onMounted, onUnmounted, ref } from 'vue';
import type { ComputedRef, Ref, VNodeChild } from 'vue';
import {
  Accelerometer,
  DeviceMotion,
  Gyroscope,
  Magnetometer,
  isAvailableAsync as isPedometerAvailableAsync,
} from '@symbiote-native/sensors';
import {
  useAccelerometer,
  useDeviceMotion,
  useGyroscope,
  useMagnetometer,
  usePedometer,
} from '@symbiote-native/sensors/vue';
import { ROUTE_NAME } from '../routes';
import { Scenario } from '../components/Scenario';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

// Pedometer has no shared singleton upstream, so it is wrapped in a stable module-level object
const PEDOMETER_SENSOR = { isAvailableAsync: isPedometerAvailableAsync };

const SENSOR_STATUS = {
  checking: 'checking',
  unavailable: 'unavailable',
  waiting: 'waiting',
  live: 'live',
} as const;
type ISensorStatus = (typeof SENSOR_STATUS)[keyof typeof SENSOR_STATUS];
type ISensorAvailability = 'checking' | 'available' | 'unavailable';

const SENSOR_STATUS_TEXT: Record<ISensorStatus, string> = {
  checking: 'CHECKING…',
  unavailable: 'UNAVAILABLE',
  waiting: 'WAITING…',
  live: 'LIVE',
};

// A sensor can be unavailable (simulator) or available with no first reading yet,
// the two must not render as one blank state
function useSensorAvailability(sensor: {
  isAvailableAsync: () => Promise<boolean>;
}): Ref<ISensorAvailability> {
  const availability = ref<ISensorAvailability>('checking');

  let isMounted = true;
  onUnmounted(() => {
    isMounted = false;
  });
  onMounted(() => {
    sensor.isAvailableAsync().then(isAvailable => {
      if (isMounted) {
        availability.value = isAvailable ? 'available' : 'unavailable';
      }
    });
  });

  return availability;
}

function useSensorStatus(
  sensor: { isAvailableAsync: () => Promise<boolean> },
  hasReading: () => boolean,
): ComputedRef<ISensorStatus> {
  const availability = useSensorAvailability(sensor);
  return computed(() => {
    if (availability.value === 'checking') {
      return SENSOR_STATUS.checking;
    }
    if (availability.value === 'unavailable') {
      return SENSOR_STATUS.unavailable;
    }
    return hasReading() ? SENSOR_STATUS.live : SENSOR_STATUS.waiting;
  });
}

function SensorStatusBadge(props: { status: ISensorStatus }) {
  return (
    <view class={`sensor-status-badge sensor-status-badge-${props.status}`}>
      <text class="sensor-status-text">{SENSOR_STATUS_TEXT[props.status]}</text>
    </view>
  );
}

function SensorCard(
  props: { testID: string; title: string; status: ISensorStatus },
  { slots }: { slots: { default?: () => VNodeChild } },
) {
  return (
    <view testID={props.testID} class="sensor-card">
      <view class="sensor-card-header">
        <text class="sensor-card-title">{props.title}</text>
        <SensorStatusBadge status={props.status} />
      </view>
      {props.status === SENSOR_STATUS.checking && (
        <text class="info-text">checking availability…</text>
      )}
      {props.status === SENSOR_STATUS.unavailable && (
        <text class="info-text">not available on this device</text>
      )}
      {props.status === SENSOR_STATUS.waiting && (
        <text class="info-text">waiting for first reading…</text>
      )}
      {props.status === SENSOR_STATUS.live && slots.default?.()}
    </view>
  );
}

function ReadingChip(props: { label: string; value: number }) {
  return (
    <view class="sensor-reading-chip">
      <text class="sensor-reading-label">{props.label}</text>
      <text class="sensor-reading-value">{props.value.toFixed(3)}</text>
    </view>
  );
}

function AxisReadingRow(props: {
  measurement: { x: number; y: number; z: number };
}) {
  return (
    <view class="sensor-reading-row">
      <ReadingChip label="X" value={props.measurement.x} />
      <ReadingChip label="Y" value={props.measurement.y} />
      <ReadingChip label="Z" value={props.measurement.z} />
    </view>
  );
}

export const SensorsScreen = defineComponent(
  () => {
    const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

    const accelerometer = useAccelerometer();
    const accelerometerStatus = useSensorStatus(
      Accelerometer,
      () => accelerometer.value !== null,
    );

    const gyroscope = useGyroscope();
    const gyroscopeStatus = useSensorStatus(
      Gyroscope,
      () => gyroscope.value !== null,
    );

    const magnetometer = useMagnetometer();
    const magnetometerStatus = useSensorStatus(
      Magnetometer,
      () => magnetometer.value !== null,
    );

    const deviceMotion = useDeviceMotion();
    const deviceMotionStatus = useSensorStatus(
      DeviceMotion,
      () => deviceMotion.value !== null,
    );

    const pedometer = usePedometer();
    const pedometerStatus = useSensorStatus(
      PEDOMETER_SENSOR,
      () => pedometer.value !== null,
    );

    return () => (
      <safe-area-view class="screen">
        <scroll-view
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
                Read the phone's motion hardware live: accelerometer, gyroscope,
                magnetometer, combined device motion and step counter. A
                simulator reports every sensor as unavailable, use a real
                device.
              </text>
            </view>
          </view>

          <Scenario
            testID="sensors-scenario"
            title="Detect a shake, a tilt, a compass heading or a step"
            why="Games, level tools and fitness features read the motion sensors: tilt to steer, shake to undo, magnetometer for a compass and the pedometer for steps."
            steps={['Tilt and shake the phone and watch the accelerometer', 'Rotate it and watch the gyroscope', 'Walk a few steps and watch the pedometer']}
            expect="The numbers change live with each movement. A card that says unavailable means the device has no such sensor or the simulator cannot provide it."
          />

          <SensorCard
            testID="sensors-accelerometer"
            title="Accelerometer"
            status={accelerometerStatus.value}
          >
            {accelerometer.value && (
              <AxisReadingRow measurement={accelerometer.value} />
            )}
          </SensorCard>

          <SensorCard
            testID="sensors-gyroscope"
            title="Gyroscope"
            status={gyroscopeStatus.value}
          >
            {gyroscope.value && <AxisReadingRow measurement={gyroscope.value} />}
          </SensorCard>

          <SensorCard
            testID="sensors-magnetometer"
            title="Magnetometer"
            status={magnetometerStatus.value}
          >
            {magnetometer.value && (
              <AxisReadingRow measurement={magnetometer.value} />
            )}
          </SensorCard>

          <SensorCard
            testID="sensors-device-motion"
            title="Device motion"
            status={deviceMotionStatus.value}
          >
            {deviceMotion.value && (
              <text class="info-text">{`interval: ${deviceMotion.value.interval.toFixed(1)}ms`}</text>
            )}
            {deviceMotion.value?.rotation && (
              <view class="sensor-reading-row">
                <ReadingChip
                  label="ALPHA"
                  value={deviceMotion.value.rotation.alpha}
                />
                <ReadingChip
                  label="BETA"
                  value={deviceMotion.value.rotation.beta}
                />
                <ReadingChip
                  label="GAMMA"
                  value={deviceMotion.value.rotation.gamma}
                />
              </view>
            )}
          </SensorCard>

          <SensorCard
            testID="sensors-pedometer"
            title="Pedometer"
            status={pedometerStatus.value}
          >
            {pedometer.value && (
              <text
                testID="sensors-pedometer-steps"
                class="sensor-reading-value"
              >
                {`${pedometer.value.steps} steps`}
              </text>
            )}
          </SensorCard>
        </scroll-view>
      </safe-area-view>
    );
  },
  { name: 'SensorsScreen' },
);
