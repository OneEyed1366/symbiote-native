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
  import {
    SafeAreaView,
    ScrollView,
    Text,
    View,
  } from '@symbiote-native/svelte';
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

<SafeAreaView class="screen">
  <ScrollView
    testID="sensors-scroll"
    class="screen"
    contentContainerStyle="scroll-content"
  >
    <View class={`line-tag line-tag-${lineInfo.line}`}>
      <Text class="line-tag-text">
        {`${lineInfo.code} · ${lineInfo.label}`}
      </Text>
    </View>
    <View class="hero-card">
      <View class="hero-badge" style={{ backgroundColor: LINE_COLOR.sensors }}>
        <Text class="hero-badge-text">{lineInfo.code}</Text>
      </View>
      <View class="hero-copy">
        <Text class="hero-title">Sensors</Text>
        <Text class="hero-body">
          @symbiote-native/sensors — live readings from five expo-sensors-backed
          hooks. A simulator reports every CoreMotion/CMPedometer-backed sensor
          as unavailable; a real device is needed to see live readings.
        </Text>
      </View>
    </View><!-- Accelerometer -->
    <View testID="sensor-card-accelerometer" class="sensor-card">
      <View class="sensor-card-header">
        <Text class="sensor-card-title">Accelerometer</Text>
        <View
          class={`sensor-status-badge sensor-status-badge-${accelerometerStatus.current}`}
        >
          <Text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[accelerometerStatus.current]}
          </Text>
        </View>
      </View>{#if accelerometerStatus.current === 'checking'}<Text
          class="info-text"
        >
          checking availability…
        </Text>{:else if accelerometerStatus.current === 'unavailable'}<Text
          class="info-text"
        >
          not available on this device
        </Text>{:else if accelerometerStatus.current === 'waiting'}<Text
          class="info-text"
        >
          waiting for first reading…
        </Text>{:else if accelerometer.current}<View class="sensor-reading-row">
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">X</Text>
            <Text class="sensor-reading-value">
              {accelerometer.current.x.toFixed(3)}
            </Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Y</Text>
            <Text class="sensor-reading-value">
              {accelerometer.current.y.toFixed(3)}
            </Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Z</Text>
            <Text class="sensor-reading-value">
              {accelerometer.current.z.toFixed(3)}
            </Text>
          </View>
        </View>{/if}
    </View><!-- Gyroscope --><View
      testID="sensor-card-gyroscope"
      class="sensor-card"
    >
      <View class="sensor-card-header">
        <Text class="sensor-card-title">Gyroscope</Text>
        <View
          class={`sensor-status-badge sensor-status-badge-${gyroscopeStatus.current}`}
        >
          <Text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[gyroscopeStatus.current]}
          </Text>
        </View>
      </View>{#if gyroscopeStatus.current === 'checking'}<Text
          class="info-text"
        >
          checking availability…
        </Text>{:else if gyroscopeStatus.current === 'unavailable'}<Text
          class="info-text"
        >
          not available on this device
        </Text>{:else if gyroscopeStatus.current === 'waiting'}<Text
          class="info-text"
        >
          waiting for first reading…
        </Text>{:else if gyroscope.current}<View class="sensor-reading-row">
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">X</Text>
            <Text class="sensor-reading-value">
              {gyroscope.current.x.toFixed(3)}
            </Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Y</Text>
            <Text class="sensor-reading-value">
              {gyroscope.current.y.toFixed(3)}
            </Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Z</Text>
            <Text class="sensor-reading-value">
              {gyroscope.current.z.toFixed(3)}
            </Text>
          </View>
        </View>{/if}
    </View><!-- Magnetometer -->
    <View testID="sensor-card-magnetometer" class="sensor-card">
      <View class="sensor-card-header">
        <Text class="sensor-card-title">Magnetometer</Text>
        <View
          class={`sensor-status-badge sensor-status-badge-${magnetometerStatus.current}`}
        >
          <Text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[magnetometerStatus.current]}
          </Text>
        </View>
      </View>{#if magnetometerStatus.current === 'checking'}<Text
          class="info-text"
        >
          checking availability…
        </Text>{:else if magnetometerStatus.current === 'unavailable'}<Text
          class="info-text"
        >
          not available on this device
        </Text>{:else if magnetometerStatus.current === 'waiting'}<Text
          class="info-text"
        >
          waiting for first reading…
        </Text>{:else if magnetometer.current}<View class="sensor-reading-row">
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">X</Text>
            <Text class="sensor-reading-value">
              {magnetometer.current.x.toFixed(3)}
            </Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Y</Text>
            <Text class="sensor-reading-value">
              {magnetometer.current.y.toFixed(3)}
            </Text>
          </View>
          <View class="sensor-reading-chip">
            <Text class="sensor-reading-label">Z</Text>
            <Text class="sensor-reading-value">
              {magnetometer.current.z.toFixed(3)}
            </Text>
          </View>
        </View>{/if}
    </View><!-- DeviceMotion — rotation is nested and can legitimately be absent from the very first event (the underlying sensor hasn't reported yet), so it is guarded at the field itself; an unguarded nested read throws with no visible error and silently blanks the screen. -->
    <View testID="sensor-card-device-motion" class="sensor-card">
      <View class="sensor-card-header">
        <Text class="sensor-card-title">Device motion</Text>
        <View
          class={`sensor-status-badge sensor-status-badge-${deviceMotionStatus.current}`}
        >
          <Text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[deviceMotionStatus.current]}
          </Text>
        </View>
      </View>{#if deviceMotionStatus.current === 'checking'}<Text
          class="info-text"
        >
          checking availability…
        </Text>{:else if deviceMotionStatus.current === 'unavailable'}<Text
          class="info-text"
        >
          not available on this device
        </Text>{:else if deviceMotionStatus.current === 'waiting'}<Text
          class="info-text"
        >
          waiting for first reading…
        </Text>{:else if deviceMotion.current}<Text class="info-text">
          {`interval: ${deviceMotion.current.interval.toFixed(1)}ms`}
        </Text>{#if deviceMotion.current.rotation}<View
            class="sensor-reading-row"
          >
            <View class="sensor-reading-chip">
              <Text class="sensor-reading-label">ALPHA</Text>
              <Text class="sensor-reading-value">
                {deviceMotion.current.rotation.alpha.toFixed(3)}
              </Text>
            </View>
            <View class="sensor-reading-chip">
              <Text class="sensor-reading-label">BETA</Text>
              <Text class="sensor-reading-value">
                {deviceMotion.current.rotation.beta.toFixed(3)}
              </Text>
            </View>
            <View class="sensor-reading-chip">
              <Text class="sensor-reading-label">GAMMA</Text>
              <Text class="sensor-reading-value">
                {deviceMotion.current.rotation.gamma.toFixed(3)}
              </Text>
            </View>
          </View>{/if}{/if}
    </View><!-- Pedometer — free functions, no shared instance, so both the availability check and the live subscription go through the standalone core exports instead of a singleton. -->
    <View testID="sensor-card-pedometer" class="sensor-card">
      <View class="sensor-card-header">
        <Text class="sensor-card-title">Pedometer</Text>
        <View
          class={`sensor-status-badge sensor-status-badge-${pedometerStatus.current}`}
        >
          <Text class="sensor-status-text">
            {SENSOR_STATUS_TEXT[pedometerStatus.current]}
          </Text>
        </View>
      </View>{#if pedometerStatus.current === 'checking'}<Text
          class="info-text"
        >
          checking availability…
        </Text>{:else if pedometerStatus.current === 'unavailable'}<Text
          class="info-text"
        >
          not available on this device
        </Text>{:else if pedometerStatus.current === 'waiting'}<Text
          class="info-text"
        >
          waiting for first reading…
        </Text>{:else if pedometer.current}<Text
          testID="sensors-pedometer-steps"
          class="sensor-reading-value"
        >
          {`${pedometer.current.steps} steps`}
        </Text>{/if}
    </View>
  </ScrollView>
</SafeAreaView>
