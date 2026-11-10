// Registers the ViewConfigs of the native tabs views, imported by `register.ts` as a bare import
// Only the codegen specs are imported, the React components of react-native-screens stay unused

import 'react-native-screens/src/fabric/tabs/TabsHostIOSNativeComponent';
import 'react-native-screens/src/fabric/tabs/TabsHostAndroidNativeComponent';
import 'react-native-screens/src/fabric/tabs/TabsScreenIOSNativeComponent';
import 'react-native-screens/src/fabric/tabs/TabsScreenAndroidNativeComponent';
import 'react-native-screens/src/fabric/tabs/TabsBottomAccessoryNativeComponent';
import 'react-native-screens/src/fabric/tabs/TabsBottomAccessoryContentNativeComponent';
