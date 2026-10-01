import { Component, inject } from '@angular/core';
import { SYMBIOTE_ELEMENTS } from '@symbiote-native/angular';
import {
  Accelerometer,
  DeviceMotion,
  Gyroscope,
  Magnetometer,
  isAvailableAsync as isPedometerAvailableAsync,
} from '@symbiote-native/sensors';
import {
  AccelerometerService,
  DeviceMotionService,
  GyroscopeService,
  MagnetometerService,
  PedometerService,
} from '@symbiote-native/sensors/angular';
import { Scenario } from '../components/Scenario';
import { ROUTE_NAME } from '../routes';
import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';
import { AxisReadingRow } from './AxisReadingRow';
import { SensorCard } from './SensorCard';
import { useSensorStatus } from './use-sensor-status';

@Component({
  selector: 'SensorsScreen',
  standalone: true,
  imports: [AxisReadingRow, Scenario, SensorCard, SYMBIOTE_ELEMENTS],
  template: `
    <safe-area-view class="screen">
      <scroll-view
        testID="sensors-scroll"
        class="screen"
        contentContainerStyle="scroll-content"
      >
        <view [class]="'line-tag line-tag-' + lineInfo.line">
          <text class="line-tag-text"
            >{{ lineInfo.code }} · {{ lineInfo.label }}</text
          >
        </view>
        <view class="hero-card">
          <view class="hero-badge" [style]="badgeStyle">
            <text class="hero-badge-text">{{ lineInfo.code }}</text>
          </view>
          <view class="hero-copy">
            <text class="hero-title">Sensors</text>
            <text class="hero-body">
              Read the phone's motion hardware live: accelerometer, gyroscope,
              magnetometer, combined device motion and step counter. A simulator
              reports every sensor as unavailable, use a real device.
            </text>
          </view>
        </view>

        <Scenario
          testID="sensors-scenario"
          title="Detect a shake, a tilt, a compass heading or a step"
          why="Games, level tools and fitness features read the motion sensors: tilt to steer, shake to undo, magnetometer for a compass and the pedometer for steps."
          [steps]="scenarioSteps"
          expect="The numbers change live with each movement. A card that says unavailable means the device has no such sensor or the simulator cannot provide it."
        />

        <SensorCard
          testID="sensors-accelerometer"
          title="Accelerometer"
          [status]="accelerometerStatus()"
        >
          @if (accelerometer(); as reading) {
            <AxisReadingRow [measurement]="reading" />
          }
        </SensorCard>

        <SensorCard
          testID="sensors-gyroscope"
          title="Gyroscope"
          [status]="gyroscopeStatus()"
        >
          @if (gyroscope(); as reading) {
            <AxisReadingRow [measurement]="reading" />
          }
        </SensorCard>

        <SensorCard
          testID="sensors-magnetometer"
          title="Magnetometer"
          [status]="magnetometerStatus()"
        >
          @if (magnetometer(); as reading) {
            <AxisReadingRow [measurement]="reading" />
          }
        </SensorCard>

        <SensorCard
          testID="sensors-device-motion"
          title="Device motion"
          [status]="deviceMotionStatus()"
        >
          @if (deviceMotion(); as motion) {
            <text class="info-text"
              >interval: {{ motion.interval.toFixed(1) }}ms</text
            >
            @if (motion.rotation; as rotation) {
              <view class="sensor-reading-row">
                <view class="sensor-reading-chip">
                  <text class="sensor-reading-label">ALPHA</text>
                  <text class="sensor-reading-value">{{
                    rotation.alpha.toFixed(3)
                  }}</text>
                </view>
                <view class="sensor-reading-chip">
                  <text class="sensor-reading-label">BETA</text>
                  <text class="sensor-reading-value">{{
                    rotation.beta.toFixed(3)
                  }}</text>
                </view>
                <view class="sensor-reading-chip">
                  <text class="sensor-reading-label">GAMMA</text>
                  <text class="sensor-reading-value">{{
                    rotation.gamma.toFixed(3)
                  }}</text>
                </view>
              </view>
            }
          }
        </SensorCard>

        <SensorCard
          testID="sensors-pedometer"
          title="Pedometer"
          [status]="pedometerStatus()"
        >
          @if (pedometer(); as counter) {
            <text testID="sensors-pedometer-steps" class="sensor-reading-value">
              {{ counter.steps }} steps
            </text>
          }
        </SensorCard>
      </scroll-view>
    </safe-area-view>
  `,
})
export class SensorsScreen {
  readonly lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];
  readonly badgeStyle = { backgroundColor: LINE_COLOR.sensors };
  readonly scenarioSteps = [
    'Tilt and shake the phone and watch the accelerometer',
    'Rotate it and watch the gyroscope',
    'Walk a few steps and watch the pedometer',
  ];

  readonly accelerometer = inject(AccelerometerService).connect();
  readonly gyroscope = inject(GyroscopeService).connect();
  readonly magnetometer = inject(MagnetometerService).connect();
  readonly deviceMotion = inject(DeviceMotionService).connect();
  readonly pedometer = inject(PedometerService).connect();

  readonly accelerometerStatus = useSensorStatus(
    () => Accelerometer.isAvailableAsync(),
    () => this.accelerometer() !== null,
  );
  readonly gyroscopeStatus = useSensorStatus(
    () => Gyroscope.isAvailableAsync(),
    () => this.gyroscope() !== null,
  );
  readonly magnetometerStatus = useSensorStatus(
    () => Magnetometer.isAvailableAsync(),
    () => this.magnetometer() !== null,
  );
  readonly deviceMotionStatus = useSensorStatus(
    () => DeviceMotion.isAvailableAsync(),
    () => this.deviceMotion() !== null,
  );
  readonly pedometerStatus = useSensorStatus(
    () => isPedometerAvailableAsync(),
    () => this.pedometer() !== null,
  );
}
