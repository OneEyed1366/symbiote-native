// The binary's own smoke: does JavaScript reach the engine, and does the platform answer back.
//
// Written against the opcode buffer directly rather than through the engine's JS, so a failure here
// names the HARNESS and nothing else. The real tests that follow come through `@symbiote-native/
// engine` and are bundled.

const slots = [{}, {}];
const instances = [{}, {}];
const ops = new Int32Array([
  0, 0, 0, 0, 0, -1, 0, 1, 0, 0, 1, -1, 6, 0, 1, 0, -1, -1, 6, 1, 1, 1, -1, -1,
  3, 0, 1, -1, -1, -1, 8, 1, 0, -1, -1, -1,
]);

__symbioteEngineNative.applyOps(
  ops,
  ['RCTView', 'nativeID'],
  ['surface', 'child'],
  instances,
  slots,
);

const shape = node => `${node.viewName}(${node.children.map(shape).join('')})`;

const mounted = __symbioteTester.mounted();
__symbioteTester.print(shape(mounted));
__symbioteTester.print(JSON.stringify(mounted.children[0].layout));
__symbioteTester.print(JSON.stringify(mounted.children[0].props));
