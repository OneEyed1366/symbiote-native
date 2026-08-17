// Guards the two §16 hazards this preprocessor exists to close, plus the cases it must leave
// alone (a legitimate single space, markup with no whitespace runs at all).

import { describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { collapseTextWhitespace } from './collapse-text-whitespace';

const preprocessor = collapseTextWhitespace();

function run(content: string): { code: string } {
  return preprocessor.markup({ content, filename: 'Probe.svelte' });
}

describe('collapseTextWhitespace — markup', () => {
  it('passes markup with no whitespace runs through unchanged', () => {
    const source = '<symbiote-view p={{}}><symbiote-text p={{}}>hi</symbiote-text></symbiote-view>';
    expect(run(source).code).toBe(source);
  });

  it('collapses a sentence wrapped across source lines to one space', () => {
    const source = '<Text>Hello world, this is a\n  long sentence.</Text>';
    expect(run(source).code).toBe('<Text>Hello world, this is a long sentence.</Text>');
  });

  it('collapses multiple embedded whitespace runs, not just the first', () => {
    const source = '<Text>one\n  two\n    three</Text>';
    expect(run(source).code).toBe('<Text>one two three</Text>');
  });

  it('deletes a whitespace-only text node between siblings that spans a line break', () => {
    const source = '<View><A/>\n  <B/></View>';
    expect(run(source).code).toBe('<View><A/><B/></View>');
  });

  it('keeps a same-line intentional single space between two expressions', () => {
    const source = '<Text>{firstName} {lastName}</Text>';
    expect(run(source).code).toBe(source);
  });

  it('collapses a same-line run of multiple spaces to one, without deleting it', () => {
    const source = '<Text>{firstName}   {lastName}</Text>';
    expect(run(source).code).toBe('<Text>{firstName} {lastName}</Text>');
  });

  it('reaches a Text node nested inside an {#each} block', () => {
    const source = '{#each items as item}<Text>row\n  {item}</Text>{/each}';
    expect(run(source).code).toBe('{#each items as item}<Text>row {item}</Text>{/each}');
  });

  it('produces markup the real compiler accepts and that ships no newline into the text content', () => {
    const source = '<Text>Hello world, this is a\n  long sentence.</Text>';
    const { code } = run(source);
    const result = compile(code, {
      generate: 'client',
      fragments: 'tree',
      css: 'external',
      filename: 'Probe.svelte',
    });
    expect(result.js.code).toContain("$.text('Hello world, this is a long sentence.')");
    expect(result.js.code).not.toMatch(/\$\.text\('[^']*\\n/);
  });
});
