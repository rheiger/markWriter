# Alpha3 ordinary code acceptance

## C

```c
#include <stdio.h>
int main(void) { return 0; }
```

## C++

```c++
#include <iostream>
class Example { public: int value = 42; };
```

## C#

```c#
using System;
public class Example { public static void Main() { Console.WriteLine("ok"); } }
```

## Objective-C

```objective-c
#import <Foundation/Foundation.h>
@interface Example : NSObject
@end
```

## SQL

```sql
SELECT name FROM users WHERE id = 42;
```

## Bash

```bash
#!/bin/bash
export NAME="value"
echo "$NAME"
```

## Zsh

```zsh
#!/bin/zsh
export NAME="value"
echo "$NAME"
```

## Rust

```rust
fn main() { let value: u32 = 42; println!("{}", value); }
```

## Python

```python
def greet(name):
    return "hello " + name
```

## Go

```go
package main
func main() { var value int = 42 }
```

## YAML

```yaml
name: example
enabled: true
items:
  - value
```

## JSON

```json
{"name": "example", "enabled": true, "value": 42}
```

## XML

```xml
<?xml version="1.0"?>
<example key="value">text</example>
```

## JavaScript

```javascript
const greet = (name) => console.log("hello", name);
```

## TypeScript

```typescript
interface Example { value: number }
const value: Example = { value: 42 };
```

## Dockerfile

```dockerfile
FROM alpine:3.22
RUN echo "hello"
CMD ["sh"]
```

## Explicit alias

```py
def alias_example():
    return True
```

## Explicit plain text

```plaintext
def deliberately_plain():
    return True
```

## Explicit unknown language

```unknown
def unknown_language():
    return True
```

## Confident unlabeled code

```
def greet(name):
    print("hello", name)
    return None
```

## Ambiguous unlabeled code

```
x = 1
```

## Escaped markup and Unicode

```js
const html = "😀<script>window.__codeExecuted = true</script>&";
```

## CSS

```css
body { font-family: sans-serif; background: #f5f5f5; }
.user span { color: #666; }
```

## Swift

```swift
let sum = (1...10).reduce(0, +)
print("Hello, World! Sum = \(sum)")
```

## Makefile

```Makefile
CC = gcc
CFLAGS = -Wall -O2
app: main.o util.o
	$(CC) $(CFLAGS) -o app main.o util.o
.PHONY: clean
```

## Objective-C filename alias

```m
#import <Foundation/Foundation.h>
int main(void) { @autoreleasepool { NSLog(@"hello"); } return 0; }
```
