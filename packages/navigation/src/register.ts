// Registers the ViewConfigs of the native screens views in `ReactNativeViewConfigRegistry`
// The engine reads them on the first commit to derive events and color processors

// Only the codegen specs are imported, never the React components of react-native-screens
// A component such as `ScreenStack.tsx` uses hooks and would crash a non-React adapter

// This is the JS half of a registration, the native half is `componentProvider` in `package.json`
// Without it Fabric falls back to its "Unimplemented component" placeholder

// A missing ViewConfig leaves Fabric without a component descriptor and crashes on mount
// `RNSSearchBar` and `RNSScreenStackHeaderSubview` were once missing for that reason

// `RNSModalScreen` is a silent trap, a plain `RNSScreen` would take Yoga's frame
// `RNSScreen.mm` skips that frame for the modal class, so the modal sits one screen too low
// `resolveScreenViewName` in `core/render-stack.ts` mirrors the vendor's choice

// react-native-screens declares `"react-native": "src/index"`, so Metro reads its raw TypeScript
// The imports below target that `src/fabric/` tree, not a compiled output

import 'react-native-screens/src/fabric/ScreenNativeComponent';
import 'react-native-screens/src/fabric/ModalScreenNativeComponent';
import 'react-native-screens/src/fabric/ScreenStackNativeComponent';
import 'react-native-screens/src/fabric/ScreenStackHeaderConfigNativeComponent';
import 'react-native-screens/src/fabric/ScreenStackHeaderSubviewNativeComponent';
import 'react-native-screens/src/fabric/SearchBarNativeComponent';
import 'react-native-screens/src/fabric/ScreenContentWrapperNativeComponent';
import 'react-native-screens/src/fabric/FullWindowOverlayNativeComponent';
import 'react-native-screens/src/fabric/ScreenFooterNativeComponent';
import 'react-native-screens/src/fabric/safe-area/SafeAreaViewNativeComponent';
import 'react-native-screens/src/fabric/ScreenContainerNativeComponent';
import 'react-native-screens/src/fabric/ScreenNavigationContainerNativeComponent';
import './register-tabs';
