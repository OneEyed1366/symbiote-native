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
import expo.modules.haptics.HapticsModule
import expo.modules.keepawake.KeepAwakeModule
import expo.modules.application.ApplicationModule
import expo.modules.crypto.CryptoModule
import expo.modules.device.DeviceModule
import expo.modules.cellular.CellularModule
import expo.modules.brightness.BrightnessModule
import expo.modules.localauthentication.LocalAuthenticationModule
import expo.modules.clipboard.ClipboardModule
import expo.modules.localization.LocalizationModule
import expo.modules.battery.BatteryModule
import expo.modules.screenorientation.ScreenOrientationModule
import expo.modules.sensors.modules.AccelerometerModule
import expo.modules.sensors.modules.BarometerModule
import expo.modules.sensors.modules.DeviceMotionModule
import expo.modules.sensors.modules.GyroscopeModule
import expo.modules.sensors.modules.LightSensorModule
import expo.modules.sensors.modules.MagnetometerModule
import expo.modules.sensors.modules.MagnetometerUncalibratedModule
import expo.modules.sensors.modules.PedometerModule
import expo.modules.network.NetworkModule
import expo.modules.systemui.SystemUIModule
import expo.modules.trackingtransparency.TrackingTransparencyModule
import expo.modules.storereview.StoreReviewModule

// There's no `expo` aggregator project here to auto-generate a module list, so this map is
// hand-maintained — every expo-modules-core package wired into this app (sensors, local-auth, and
// whatever demo lands next) needs its own entry here, or requireNativeModule(...) fails at RUNTIME
// with "Cannot find native module '<Name>'", not at build time (see the symbiote-expo-native-module
// skill). ModuleRegistryAdapter only accepts a single ModulesProvider, so every package's modules
// share this one map rather than each getting its own adapter. Each key string must match that
// module's own `definition() { Name("...") }` exactly.
private class ExpoModulesProvider : ModulesProvider {
  override fun getModulesMap(): Map<Class<out Module>, String?> = mapOf(
    // SYMBIOTE-EXPO-LINK:MODULES-MAP (generated — new lines are appended below, safe to keep)
    StoreReviewModule::class.java to "ExpoStoreReview",
    TrackingTransparencyModule::class.java to "ExpoTrackingTransparency",
    SystemUIModule::class.java to "ExpoSystemUI",
    NetworkModule::class.java to "ExpoNetwork",
    PedometerModule::class.java to "ExponentPedometer",
    MagnetometerUncalibratedModule::class.java to "ExponentMagnetometerUncalibrated",
    MagnetometerModule::class.java to "ExponentMagnetometer",
    LightSensorModule::class.java to "ExpoLightSensor",
    GyroscopeModule::class.java to "ExponentGyroscope",
    DeviceMotionModule::class.java to "ExponentDeviceMotion",
    BarometerModule::class.java to "ExpoBarometer",
    AccelerometerModule::class.java to "ExponentAccelerometer",
    ScreenOrientationModule::class.java to "ExpoScreenOrientation",
    BatteryModule::class.java to "ExpoBattery",
    LocalizationModule::class.java to "ExpoLocalization",
    ClipboardModule::class.java to "ExpoClipboard",
    LocalAuthenticationModule::class.java to "ExpoLocalAuthentication",
    BrightnessModule::class.java to "ExpoBrightness",
    CellularModule::class.java to "ExpoCellular",
    DeviceModule::class.java to "ExpoDevice",
    CryptoModule::class.java to "ExpoCrypto",
    ApplicationModule::class.java to "ExpoApplication",
    KeepAwakeModule::class.java to "ExpoKeepAwake",
    HapticsModule::class.java to "ExpoHaptics",
  )
}

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())

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
