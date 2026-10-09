import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  isSymbioteNode,
  setTreeHost,
  treeHost,
  type ISymbioteNode,
} from '@symbiote-native/engine';

type ITreeHost = NonNullable<ReturnType<typeof treeHost>>;

const FIRST_TAG = 100;

function createTagger() {
  const tags = new WeakMap<object, number>();
  let nextTag = FIRST_TAG;
  return (handle: object): number => {
    const known = tags.get(handle) ?? (nextTag += 1);
    tags.set(handle, known);
    return known;
  };
}

// The host as it is, but every committed node has a tag of its own and a stand-in wrapper that says
// which tag it is for
function withNodeWrappers(real: ITreeHost) {
  const tagOf = createTagger();
  const wrappers = new WeakMap<ISymbioteNode, object>();
  const host: ITreeHost = {
    ...real,
    committedRecordOf: handle => {
      const record = real.committedRecordOf(handle);
      return record === undefined
        ? undefined
        : { ...record, tag: tagOf(handle) };
    },
    shadowNodeWrapperOf: handle => {
      if (!isSymbioteNode(handle)) return undefined;
      if (real.committedRecordOf(handle) === undefined) return undefined;
      const wrapper = wrappers.get(handle) ?? { forTag: tagOf(handle) };
      wrappers.set(handle, wrapper);
      return wrapper;
    },
  };
  return { host, wrapperOf: (node: ISymbioteNode) => wrappers.get(node) };
}

// A headless host cannot build a `ShadowNodeWrapper` and gives every node one tag
export function installWrapperHost() {
  const fabric = installRecordingFabric();
  const real = treeHost();
  if (real === undefined) throw new Error('no host installed');
  const { host, wrapperOf } = withNodeWrappers(real);
  setTreeHost(host);
  return { fabric, wrapperOf };
}
