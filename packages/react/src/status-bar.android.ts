// StatusBar on Android — drives the Android StatusBarManager from props (and from the
// static methods). Android's native module is a DIFFERENT shape from iOS: single-arg
// setHidden(hidden) / setStyle(style) plus setColor/setTranslucent — same module name
// ('StatusBarManager'). Metro picks this on an Android host; iOS keeps its own shape.
//
// History: this used to be a no-op. Driving the window flags from our bridgeless surface
// blanked the app — a status-bar relayout triggered stopSurface, which threw "Global was
// not installed" because RN installs global.RN$stopSurface from its own renderer, which we
// replace. Now that render.ts installs RN$stopSurface and tears surfaces down cleanly, the
// relayout survives and the bar updates without blanking (verified on device: show/hide +
// light/dark text). See render.ts installStopSurfaceGlobal + native-module-platform-routing.

import { useEffect } from 'react'
import { dlog, getNativeModule } from '@symbiote/shared'
import { STATUS_BAR_MANAGER, type StatusBarComponent } from './status-bar-shared'
export type { StatusBarProps, StatusBarStyle } from './status-bar-shared'

// The native module typed as the interface we vouch for — only the Android setters we
// call. Single point that accepts the native shape (no per-call `as`).
interface NativeStatusBarManagerAndroid {
  setHidden(hidden: boolean): void
  setStyle(statusBarStyle?: string): void
}

// Renders null and applies its props to the native module in an effect, on mount and on
// every prop change — same contract as iOS, with the single-arg Android setters.
const StatusBarAndroid: StatusBarComponent = (props) => {
  const { barStyle, hidden } = props

  useEffect(() => {
    const manager = getNativeModule<NativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)
    if (manager === null) {
      dlog('StatusBar android: StatusBarManager not resolvable — skipping')
      return
    }
    dlog(`StatusBar android -> barStyle=${barStyle} hidden=${hidden}`)
    if (barStyle !== undefined) manager.setStyle(barStyle)
    if (hidden !== undefined) manager.setHidden(hidden)
  }, [barStyle, hidden])

  return null
}

StatusBarAndroid.setBarStyle = (style) => {
  dlog(`StatusBar.setBarStyle android ${style}`)
  getNativeModule<NativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.setStyle(style)
}
StatusBarAndroid.setHidden = (hidden) => {
  dlog(`StatusBar.setHidden android ${hidden}`)
  getNativeModule<NativeStatusBarManagerAndroid>(STATUS_BAR_MANAGER)?.setHidden(hidden)
}
StatusBarAndroid.setNetworkActivityIndicatorVisible = () => {
  // No Android equivalent — an iOS-only concept.
  dlog('StatusBar.setNetworkActivityIndicatorVisible (android no-op)')
}

export const StatusBar = StatusBarAndroid
