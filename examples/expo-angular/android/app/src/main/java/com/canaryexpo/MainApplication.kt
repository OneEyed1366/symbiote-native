package com.canaryexpo

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import expo.modules.adapters.react.ModuleRegistryAdapter
import expo.modules.adapters.react.ReactAdapterPackage
import expo.modules.adapters.react.ReactModuleRegistryProvider
import expo.modules.kotlin.ModulesProvider
import expo.modules.kotlin.modules.Module
import expo.modules.localauthentication.LocalAuthenticationModule
import expo.modules.sensors.modules.AccelerometerModule
import expo.modules.sensors.modules.BarometerModule
import expo.modules.sensors.modules.DeviceMotionModule
import expo.modules.sensors.modules.GyroscopeModule
import expo.modules.sensors.modules.LightSensorModule
import expo.modules.sensors.modules.MagnetometerModule
import expo.modules.sensors.modules.MagnetometerUncalibratedModule
import expo.modules.sensors.modules.PedometerModule

// There's no `expo` aggregator project here to auto-generate a module list, so this map is
// hand-maintained — every expo-modules-core package wired into this app (sensors, local-auth, and
// whatever demo lands next) needs its own entry here, or requireNativeModule(...) fails at RUNTIME
// with "Cannot find native module '<Name>'", not at build time (see the symbiote-expo-native-module
// skill). ModuleRegistryAdapter only accepts a single ModulesProvider, so every package's modules
// share this one map rather than each getting its own adapter. Each key string must match that
// module's own `definition() { Name("...") }` exactly.
private class ExpoModulesProvider : ModulesProvider {
  override fun getModulesMap(): Map<Class<out Module>, String?> = mapOf(
    AccelerometerModule::class.java to "ExponentAccelerometer",
    BarometerModule::class.java to "ExpoBarometer",
    DeviceMotionModule::class.java to "ExponentDeviceMotion",
    GyroscopeModule::class.java to "ExponentGyroscope",
    LightSensorModule::class.java to "ExpoLightSensor",
    MagnetometerModule::class.java to "ExponentMagnetometer",
    MagnetometerUncalibratedModule::class.java to "ExponentMagnetometerUncalibrated",
    PedometerModule::class.java to "ExponentPedometer",
    LocalAuthenticationModule::class.java to "ExpoLocalAuthentication",
  )
}

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // expo-modules-core has no react-native.config.js of its own, so RN's autolinking
          // never finds it — ModuleRegistryAdapter is the standard expo-modules-core/React
          // bridge, wired manually like any package autolinking can't reach.
          add(
            ModuleRegistryAdapter(
              ReactModuleRegistryProvider(listOf(ReactAdapterPackage())),
              ExpoModulesProvider(),
            ),
          )
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
