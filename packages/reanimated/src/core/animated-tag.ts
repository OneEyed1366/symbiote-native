import Upstream from 'react-native-reanimated';
import { createAnimatedComponent } from './animated-component';

// The component type a framework gives each host tag, which an adapter declares next to its props
export type IHostTagTypes = {
  View: unknown;
  Text: unknown;
  Image: unknown;
  TextInput: unknown;
};

// A host tag is what a framework's `createElement` takes as a component, which the type of a string
// cannot say. The caller names the component type its framework gives the tag
function isTaggedAs<Component>(_tag: string): _tag is string & Component {
  return true;
}

function animatedTag<Component>(tag: string): string & Component {
  if (!isTaggedAs<Component>(tag)) throw new Error('unreachable');
  return tag;
}

// The module of an adapter: the host tags, the two components it writes itself, and `Animated`
export function animatedModule<Tags extends IHostTagTypes, ScrollView, List>(
  scrollView: ScrollView,
  flatList: List,
) {
  const parts = {
    View: animatedTag<Tags['View']>('view'),
    Text: animatedTag<Tags['Text']>('text'),
    Image: animatedTag<Tags['Image']>('image'),
    TextInput: animatedTag<Tags['TextInput']>('text-input'),
    ScrollView: scrollView,
    FlatList: flatList,
  };
  const { addWhitelistedNativeProps, addWhitelistedUIProps } = Upstream;
  return {
    ...parts,
    Animated: {
      ...parts,
      createAnimatedComponent,
      addWhitelistedNativeProps,
      addWhitelistedUIProps,
    },
  };
}
