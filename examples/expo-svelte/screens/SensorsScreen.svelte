<script lang="ts">
  // @symbiote-native/sensors tour stop — one card per DeviceSensor-shaped sensor (Accelerometer,
  // Gyroscope, Magnetometer, DeviceMotion) plus Pedometer (free functions, no shared instance —
  // see packages/sensors/src/core/pedometer.ts). Every rune comes straight from
  // @symbiote-native/sensors/svelte; the core singletons are used ONLY for their own
  // isAvailableAsync() check, kept as a separate piece of state per sensor so "not available on
  // this device" never gets conflated with "no reading yet" — both look identical on the iOS
  // Simulator (no real CoreMotion/CMPedometer hardware), and only a distinct UI state tells them
  // apart (see the symbiote-expo-native-module skill). Svelte twin of
  // ../../expo-vue-sfc/screens/SensorsScreen.vue — same 4-state card (checking/unavailable/
  // waiting/live) and X/Y/Z reading-chip layout.
  import { ScrollView } from '@symbiote-native/svelte';
  // The four sensor singletons come from the package ROOT, not from /svelte: the Svelte entry
  // deliberately re-exports only the runes, the measurement types and Pedometer's free functions
  // (packages/sensors/src/svelte/index.ts), so Accelerometer/Gyroscope/Magnetometer/DeviceMotion
  // are reachable only through the framework-agnostic core — exactly as the Vue twin imports them.
  import {
    Accelerometer,
    DeviceMotion,
    Gyroscope,
    Magnetometer,
  } from '@symbiote-native/sensors';
  import {
    isAvailableAsync as isPedometerAvailableAsync,
    useAccelerometer,
    useDeviceMotion,
    useGyroscope,
    useMagnetometer,
    usePedometer,
  } from '@symbiote-native/sensors/svelte';
  import { ROUTE_NAME } from '../routes';
  import { LINE_COLOR, ROUTE_LINE_INFO } from '../navigation-lines';

  const lineInfo = ROUTE_LINE_INFO[ROUTE_NAME.Sensors];

  type ISensorAvailability = 'checking' | 'unavailable' | 'available';
  type ISensorStatus = 'checking' | 'unavailable' | 'waiting' | 'live';

  // Boxed getters, the shape every rune in this repo hands back: Svelte 5 reactivity is lexically
  // scoped to the declaring module, so a bare `$state`/`$derived` returned from a plain function
  // arrives dead at the caller. `.current` is the Svelte equivalent of unwrapping Vue's `Ref`.
  type IAvailabilityBox = { readonly current: ISensorAvailability };
  type IStatusBox = { readonly current: ISensorStatus };

  const SENSOR_STATUS_TEXT: Record<ISensorStatus, string> = {
    checking: 'CHECKING…',
    unavailable: 'UNAVAILABLE',
    waiting: 'WAITING…',
    live: 'LIVE',
  };

  // Wires one sensor's own isAvailableAsync() check into local state, on mount — kept separate
  // from the rune's live reading so "checking" / "not available" / "waiting for first reading"
  // render as three genuinely distinct states, not one blank guess. The effect only WRITES
  // `availability` (and only from an async continuation), so its dependency set stays empty and
  // it runs exactly once.
  function useSensorAvailability(
    checkAsync: () => Promise<boolean>,
  ): IAvailabilityBox {
    let availability = $state<ISensorAvailability>('checking');
    $effect(() => {
      void checkAsync().then(isAvailable => {
        availability = isAvailable ? 'available' : 'unavailable';
      });
    });
    return {
      get current(): ISensorAvailability {
        return availability;
      },
    };
  }

  function sensorStatus(
    availability: IAvailabilityBox,
    hasReading: () => boolean,
  ): IStatusBox {
    const status = $derived.by((): ISensorStatus => {
      if (availability.current === 'checking') return 'checking';
      if (availability.current === 'unavailable') return 'unavailable';
      return hasReading() ? 'live' : 'waiting';
    });
    return {
      get current(): ISensorStatus {
        return status;
      },
    };
  }

  const accelerometer = useAccelerometer();
  const accelerometerAvailability = useSensorAvailability(() =>
    Accelerometer.isAvailableAsync(),
  );
  const accelerometerStatus = sensorStatus(
    accelerometerAvailability,
    () => accelerometer.current !== null,
  );

  const gyroscope = useGyroscope();
  const gyroscopeAvailability = useSensorAvailability(() =>
    Gyroscope.isAvailableAsync(),
  );
  const gyroscopeStatus = sensorStatus(
    gyroscopeAvailability,
    () => gyroscope.current !== null,
  );

  const magnetometer = useMagnetometer();
  const magnetometerAvailability = useSensorAvailability(() =>
    Magnetometer.isAvailableAsync(),
  );
  const magnetometerStatus = sensorStatus(
    magnetometerAvailability,
    () => magnetometer.current !== null,
  );

  const deviceMotion = useDeviceMotion();
  const deviceMotionAvailability = useSensorAvailability(() =>
    DeviceMotion.isAvailableAsync(),
  );
  const deviceMotionStatus = sensorStatus(
    deviceMotionAvailability,
    () => deviceMotion.current !== null,
  );

  const pedometer = usePedometer();
  const pedometerAvailability = useSensorAvailability(() =>
    isPedometerAvailableAsync(),
  );
  const pedometerStatus = sensorStatus(
    pedometerAvailability,
    () => pedometer.current !== null,
  );
</script>

<safe-area-view class="screen">
  <ScrollView
    testID="sensors-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <view class={`line-tag line-tag-${lineInfo.line}`}>
      <text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </text>
    </view>
    <view class="hero-card">
      <view class="hero-badge" style={{ backgroundColor: LINE_COLOR.sensors }}>
        <text class="hero-badge-text">{lineInfo.code}</text>
      </view>
      <view class="hero-copy">
        <text class="hero-title">Sensors</text>
        <text class="hero-body">
          @symbiote-native/sensors — live readings from five expo-sensors-backed
          hooks. A simulator reports every CoreMotion/CMPedometer-backed sensor
          as unavailable; a real device is needed to see live readings.
        </text>
      </view>
    </view>
    <!-- Accelerometer -->
    <view testID="sensor-card-accelerometer" class="sensor-card">
      <view class="sensor-card-header">
        <text class="sensor-card-title">Accelerometer</text>
        <view
          class={`sensor-status-badge sensor-status-badge-${accelerometerStatus.current}`}
        >
          <text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[accelerometerStatus.current]}
          </text>
        </view>
      </view>
      {#if accelerometerStatus.current === 'checking'}<text class="info-text">
          checking availability…
        </text>{:else if accelerometerStatus.current === 'unavailable'}<text
          class="info-text"
        >
          not available on this device
        </text>{:else if accelerometerStatus.current === 'waiting'}<text
          class="info-text"
        >
          waiting for first reading…
        </text>{:else if accelerometer.current}<view class="sensor-reading-row">
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">X</text>
            <text class="sensor-reading-value">
              {accelerometer.current.x.toFixed(3)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Y</text>
            <text class="sensor-reading-value">
              {accelerometer.current.y.toFixed(3)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Z</text>
            <text class="sensor-reading-value">
              {accelerometer.current.z.toFixed(3)}
            </text>
          </view>
        </view>{/if}
    </view>
    <!-- Gyroscope -->
    <view testID="sensor-card-gyroscope" class="sensor-card">
      <view class="sensor-card-header">
        <text class="sensor-card-title">Gyroscope</text>
        <view
          class={`sensor-status-badge sensor-status-badge-${gyroscopeStatus.current}`}
        >
          <text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[gyroscopeStatus.current]}
          </text>
        </view>
      </view>
      {#if gyroscopeStatus.current === 'checking'}<text class="info-text">
          checking availability…
        </text>{:else if gyroscopeStatus.current === 'unavailable'}<text
          class="info-text"
        >
          not available on this device
        </text>{:else if gyroscopeStatus.current === 'waiting'}<text
          class="info-text"
        >
          waiting for first reading…
        </text>{:else if gyroscope.current}<view class="sensor-reading-row">
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">X</text>
            <text class="sensor-reading-value">
              {gyroscope.current.x.toFixed(3)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Y</text>
            <text class="sensor-reading-value">
              {gyroscope.current.y.toFixed(3)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Z</text>
            <text class="sensor-reading-value">
              {gyroscope.current.z.toFixed(3)}
            </text>
          </view>
        </view>{/if}
    </view>
    <!-- Magnetometer -->
    <view testID="sensor-card-magnetometer" class="sensor-card">
      <view class="sensor-card-header">
        <text class="sensor-card-title">Magnetometer</text>
        <view
          class={`sensor-status-badge sensor-status-badge-${magnetometerStatus.current}`}
        >
          <text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[magnetometerStatus.current]}
          </text>
        </view>
      </view>
      {#if magnetometerStatus.current === 'checking'}<text class="info-text">
          checking availability…
        </text>{:else if magnetometerStatus.current === 'unavailable'}<text
          class="info-text"
        >
          not available on this device
        </text>{:else if magnetometerStatus.current === 'waiting'}<text
          class="info-text"
        >
          waiting for first reading…
        </text>{:else if magnetometer.current}<view class="sensor-reading-row">
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">X</text>
            <text class="sensor-reading-value">
              {magnetometer.current.x.toFixed(3)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Y</text>
            <text class="sensor-reading-value">
              {magnetometer.current.y.toFixed(3)}
            </text>
          </view>
          <view class="sensor-reading-chip">
            <text class="sensor-reading-label">Z</text>
            <text class="sensor-reading-value">
              {magnetometer.current.z.toFixed(3)}
            </text>
          </view>
        </view>{/if}
    </view>
    <!-- DeviceMotion — rotation is nested and can legitimately be absent from the very first event (the underlying sensor hasn't reported yet), so it is guarded at the field itself; an unguarded nested read throws with no visible error and silently blanks the screen. -->
    <view testID="sensor-card-device-motion" class="sensor-card">
      <view class="sensor-card-header">
        <text class="sensor-card-title">Device motion</text>
        <view
          class={`sensor-status-badge sensor-status-badge-${deviceMotionStatus.current}`}
        >
          <text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[deviceMotionStatus.current]}
          </text>
        </view>
      </view>
      {#if deviceMotionStatus.current === 'checking'}<text class="info-text">
          checking availability…
        </text>{:else if deviceMotionStatus.current === 'unavailable'}<text
          class="info-text"
        >
          not available on this device
        </text>{:else if deviceMotionStatus.current === 'waiting'}<text
          class="info-text"
        >
          waiting for first reading…
        </text>{:else if deviceMotion.current}<text class="info-text">
          {`interval: ${deviceMotion.current.interval.toFixed(1)}ms`}
        </text>
        {#if deviceMotion.current.rotation}<view class="sensor-reading-row">
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">ALPHA</text>
              <text class="sensor-reading-value">
                {deviceMotion.current.rotation.alpha.toFixed(3)}
              </text>
            </view>
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">BETA</text>
              <text class="sensor-reading-value">
                {deviceMotion.current.rotation.beta.toFixed(3)}
              </text>
            </view>
            <view class="sensor-reading-chip">
              <text class="sensor-reading-label">GAMMA</text>
              <text class="sensor-reading-value">
                {deviceMotion.current.rotation.gamma.toFixed(3)}
              </text>
            </view>
          </view>{/if}{/if}
    </view>
    <!-- Pedometer — free functions, no shared instance, so both the availability check and the live subscription go through the standalone core exports instead of a singleton. -->
    <view testID="sensor-card-pedometer" class="sensor-card">
      <view class="sensor-card-header">
        <text class="sensor-card-title">Pedometer</text>
        <view
          class={`sensor-status-badge sensor-status-badge-${pedometerStatus.current}`}
        >
          <text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[pedometerStatus.current]}
          </text>
        </view>
      </view>
      {#if pedometerStatus.current === 'checking'}<text class="info-text">
          checking availability…
        </text>{:else if pedometerStatus.current === 'unavailable'}<text
          class="info-text"
        >
          not available on this device
        </text>{:else if pedometerStatus.current === 'waiting'}<text
          class="info-text"
        >
          waiting for first reading…
        </text>{:else if pedometer.current}<text
          testID="sensors-pedometer-steps"
          class="sensor-reading-value"
        >
          {`${pedometer.current.steps} steps`}
        </text>{/if}
    </view>
  </ScrollView>
</safe-area-view>
