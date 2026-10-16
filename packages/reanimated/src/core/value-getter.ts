// What stands in a worklet's closure for an accessor of a framework, such as a signal, which has no
// way to reach the UI runtime: the same call, answering with the value the accessor held
export function valueGetter<Value>(value: Value): () => Value {
  return () => {
    'worklet';
    return value;
  };
}
