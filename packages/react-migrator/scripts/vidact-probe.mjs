import { readFileSync } from 'node:fs';
import { analyzeSync, compileSync } from '@vidact/compiler';

const RN_COUNTER = `
import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
export function Counter({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  const doubled = count * 2;
  return (
    <View style={{ padding: 8 }}>
      <Pressable onPress={() => setCount(count + 1)}><Text>{label}</Text></Pressable>
      {count > 3 ? <Text>{doubled}</Text> : null}
    </View>
  );
}`;

const DOM_COUNTER = RN_COUNTER
  .replace("import { View, Text, Pressable } from 'react-native';", '')
  .replaceAll('View', 'div').replaceAll('Pressable', 'button').replaceAll('Text', 'span')
  .replace('onPress', 'onClick');

const inputs = [
  ['inline/RnCounter.tsx', RN_COUNTER],
  ['inline/DomCounter.tsx', DOM_COUNTER],
  ...process.argv.slice(2).map((file) => [file, readFileSync(file, 'utf8')]),
];

const firstLine = (error) => String(error?.message ?? error).split('\n').slice(0, 3).join(' | ');

for (const [filename, source] of inputs) {
  console.log(`\n=== ${filename}`);
  try {
    const analysis = analyzeSync(source, { filename });
    for (const component of analysis.components) {
      const sources = component.sources.map((s) => `${s.name}:${s.kind}`).join(', ');
      const updaters = component.updaters.map((u) => `${u.kind}[r${u.reads}|w${u.writes}]`).join(', ');
      console.log(`analyze ${component.name}: sources {${sources}} updaters {${updaters}}`);
    }
    if (analysis.components.length === 0) console.log('analyze: 0 components');
  } catch (error) {
    console.log(`analyze FAIL: ${firstLine(error)}`);
  }
  try {
    const features = (process.env.FEATURES ?? '').split(',').filter(Boolean);
    const result = compileSync(source, { filename, target: 'client', features });
    console.log(`compile OK, ${result.code.length} chars`);
    if (filename.startsWith('inline/') || process.env.PRINT) console.log(result.code.slice(0, 2_500));
  } catch (error) {
    console.log(`compile FAIL: ${firstLine(error)}`);
  }
}
