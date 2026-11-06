import { describe, expect, it } from 'vitest'
import { createCodeHighlighter, highlightCode, highlightedHtml, CODE_LIMIT, AUTO_LIMIT } from './codeHighlight'

const examples: [string, string][] = [
  ['c', '#include <stdio.h>\nint main(void) { return 0; }'],
  ['c++', '#include <iostream>\nclass Example { public: int value = 42; };'],
  ['c#', 'using System;\npublic class Example { public static void Main() { Console.WriteLine("ok"); } }'],
  ['objective-c', '#import <Foundation/Foundation.h>\n@interface Example : NSObject\n@end'],
  ['sql', 'SELECT name FROM users WHERE id = 42;'],
  ['bash', '#!/bin/bash\nexport NAME="value"\necho "$NAME"'],
  ['zsh', '#!/bin/zsh\nexport NAME="value"\necho "$NAME"'],
  ['rust', 'fn main() { let value: u32 = 42; println!("{}", value); }'],
  ['python', 'def greet(name):\n    return "hello " + name'],
  ['go', 'package main\nfunc main() { var value int = 42 }'],
  ['yaml', 'name: example\nenabled: true\nitems:\n  - value'],
  ['json', '{"name": "example", "enabled": true, "value": 42}'],
  ['xml', '<?xml version="1.0"?>\n<example key="value">text</example>'],
  ['javascript', 'const greet = (name) => console.log("hello", name);'],
  ['typescript', 'interface Example { value: number }\nconst value: Example = { value: 42 };'],
  ['dockerfile', 'FROM alpine:3.22\nRUN echo "hello"\nCMD ["sh"]'],
]
describe('ordinary code highlighting', () => {
  it.each(examples)('highlights explicit %s without changing its text', (language, code) => {
    const result = highlightCode(code, language)
    expect(result.language).toBeTruthy()
    expect(result.ranges.length).toBeGreaterThan(0)
    const element = document.createElement('code'); element.innerHTML = highlightedHtml(code, result)
    expect(element.textContent).toBe(code)
    expect(element.querySelector('span')).not.toBeNull()
  })
  it.each(['py', 'js', 'ts', 'objc', 'golang', 'yml', 'docker', 'C++', 'cs', 'sh', 'mjs', 'cjs', 'mts', 'cts', 'h', 'hh', 'hxx', 'jsonc'])('accepts the %s alias and trailing fence metadata', alias => {
    expect(highlightCode('return "value"; # value\n42', alias + ' title="example"').language).toBeTruthy()
  })
  it.each(['text', 'plain', 'plaintext', 'txt', 'nohighlight', 'no-highlight', 'unknown', 'mermaid', 'dot', 'graphviz', 'dbml', 'plantuml'])('never auto-detects explicit %s', info => {
    expect(highlightCode('def example():\n  return True\n', info).ranges).toEqual([])
  })
  it('detects convincing unlabeled code and leaves prose or ambiguous input plain', () => {
    expect(highlightCode('def greet(name):\n    print("hello", name)\n    return None\n').language).toBe('python')
    expect(highlightCode('ordinary words with no syntax').language).toBeNull()
    expect(highlightCode('x = 1').language).toBeNull()
  })
  it('escapes hostile markup and preserves UTF-16 offsets', () => {
    const code = 'const value = "😀<script>alert(1)</script>&";'
    const html = highlightedHtml(code, highlightCode(code, 'js'))
    const element = document.createElement('code'); element.innerHTML = html
    expect(element.textContent).toBe(code)
    expect(element.querySelector('script')).toBeNull()
    expect(html).toContain('&lt;script&gt;')
  })
  it('bounds each block and document work, leaving the rest plain', () => {
    expect(highlightCode('a '.repeat(8192), 'cpp').ranges).toEqual([])
    expect(highlightCode('a '.repeat(8192), 'cpp').language).toBeNull()
    expect(highlightCode('x'.repeat(CODE_LIMIT + 1), 'js').ranges).toEqual([])
    expect(highlightCode('x'.repeat(AUTO_LIMIT + 1)).ranges).toEqual([])
    const highlight = createCodeHighlighter(true)
    for (let n=0;n<64;n++) highlight('const value = 42;', 'js')
    expect(highlight('const extra = 42;', 'js').ranges).toEqual([])
    expect(createCodeHighlighter(false)('const value = 42;', 'js').ranges).toEqual([])
  })
})
