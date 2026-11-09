import Foundation

func check(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { fputs("FAIL: \(message)\n", stderr); exit(1) }
}
let markdown = PreviewRenderer.render(data: Data("# Title\n\n<script>alert(1)</script>\n\n```js\nx < y\n```".utf8), extension: "md")
check(markdown.contains("<h1>Title</h1>"), "Markdown heading")
check(markdown.contains("&lt;script&gt;"), "HTML escaped")
check(markdown.contains("<pre><code data-language=\"js\">x &lt; y"), "fenced code")
check(!markdown.contains("<script>"), "no active script")
let json = PreviewRenderer.render(data: Data("{\"b\":2,\"a\":1}".utf8), extension: "json")
check(json.contains("&quot;a&quot; : 1"), "formatted JSON")
let jsonl = PreviewRenderer.render(data: Data("{\"a\":1}\n[1,2]".utf8), extension: "jsonl")
check(jsonl.contains("JSON Lines") && jsonl.contains("&quot;a&quot; : 1"), "formatted JSONL")
check(PreviewRenderer.render(data: Data("{broken".utf8), extension: "json").contains("Invalid JSON"), "invalid JSON fallback")
check(PreviewRenderer.render(data: Data("a: &lt;".utf8), extension: "yaml").contains("Literal text"), "YAML literal fallback")
check(PreviewRenderer.render(data: Data(repeating: 65, count: 1_048_577), extension: "md").contains("1 MiB"), "size limit")
check(PreviewRenderer.render(data: Data([0xff]), extension: "md").contains("UTF-8"), "encoding fallback")
check(PreviewRenderer.render(data: Data("x".utf8), extension: "other").contains("Unsupported"), "unknown type fallback")
let xml = PreviewRenderer.render(data: Data("<root><item>value</item><empty/></root>".utf8), extension: "xml")
check(xml.contains("Formatted XML") && xml.contains("  &lt;item&gt;value&lt;/item&gt;"), "element-only XML formatting")
let mixed = PreviewRenderer.render(data: Data("<p>hello <b>world</b></p>".utf8), extension: "xml")
check(mixed.contains("Literal text"), "mixed XML falls back")
let entity = PreviewRenderer.render(data: Data("<!DOCTYPE a [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><a>&x;</a>".utf8), extension: "xml")
check(entity.contains("Literal text") && !entity.contains("Formatted XML"), "DTD falls back")
check(PreviewRenderer.render(data: Data("<a><b></a>".utf8), extension: "xml").contains("Literal text"), "invalid XML falls back")
check(PreviewRenderer.render(data: Data("<a x=\"1\"/>".utf8), extension: "xml").contains("Literal text"), "attributes fall back")
check(PreviewRenderer.render(data: Data((String(repeating: "<a>", count: 65) + String(repeating: "</a>", count: 65)).utf8), extension: "xml").contains("Literal text"), "deep XML falls back")
check(PreviewRenderer.render(data: Data("<?xml version=\"1.0\"?><a/>".utf8), extension: "xml").contains("Literal text"), "XML declaration falls back")
print("Quick Look renderer tests passed")
let faithful = PreviewRenderer.render(data: Data("{\"n\":9007199254740993,\"n\":1.234567890123456789}".utf8), extension: "json")
check(faithful.contains("9007199254740993") && faithful.contains("1.234567890123456789") && faithful.components(separatedBy: "&quot;n&quot;").count == 3, "JSON lexemes and duplicate keys retained")
let deepJSON = String(repeating: "[", count: 40) + "0" + String(repeating: "]", count: 40)
check(PreviewRenderer.render(data: Data(deepJSON.utf8), extension: "json").contains("Literal text"), "deep JSON falls back")
let partial = PreviewRenderer.render(data: Data("{\"x\":1}\r\nBAD\n[2]\r3".utf8), extension: "jsonl")
check(partial.contains("Line 2: invalid JSON") && partial.contains("Line 3") && partial.contains("Line 4"), "JSONL independent records and line numbers")
let crlf = PreviewRenderer.render(data: Data("first\r\nsecond\r\n\r\nthird".utf8), extension: "md")
check(crlf.contains("first\nsecond</p><p>third"), "CRLF Markdown has no extra paragraph")
let testDir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(UUID().uuidString)
try FileManager.default.createDirectory(at: testDir, withIntermediateDirectories: false)
defer { try? FileManager.default.removeItem(at: testDir) }
let ordinary = testDir.appendingPathComponent("file.md")
try Data("hello".utf8).write(to: ordinary)
let readResult = try SafeFileReader.read(ordinary)
check(readResult == Data("hello".utf8), "regular file read")
let symlink = testDir.appendingPathComponent("link.md")
try FileManager.default.createSymbolicLink(at: symlink, withDestinationURL: ordinary)
check((try? SafeFileReader.read(symlink)) == nil, "symlink rejected")
let fifo = testDir.appendingPathComponent("fifo.md")
check(mkfifo(fifo.path, 0o600) == 0, "create FIFO fixture")
check((try? SafeFileReader.read(fifo)) == nil, "FIFO rejected without blocking")
print("Additional fidelity and file safety tests passed")
check(JSONFormatter.format("[1,2,3]", outputLimit: 5) == nil, "JSON output cap")
check(JSONFormatter.format("[1,] ") == nil, "invalid JSON syntax rejected")
let unicodeLines = PreviewRenderer.render(data: Data("\"a\u{2028}b\"\ntrue".utf8), extension: "jsonl")
check(unicodeLines.contains("Line 2") && !unicodeLines.contains("Line 3"), "JSONL splits only CR and LF")
let largeFile = testDir.appendingPathComponent("large.md")
try Data(repeating: 65, count: PreviewRenderer.limit + 100).write(to: largeFile)
let largeRead = try SafeFileReader.read(largeFile)
check(largeRead.count == PreviewRenderer.limit + 1, "bounded file read")
print("Additional boundary tests passed")
let simpleYAML = PreviewRenderer.render(data: Data("short: 0001\nlonger_key: false\n---\nthird: 12.30\nlongest_key: text\n".utf8), extension: "yaml")
check(simpleYAML.contains("Formatted YAML") && simpleYAML.contains("short     : 0001") && simpleYAML.contains("third      : 12.30"), "YAML simple mappings aligned without scalar conversion across documents")
let aliasesYAML = PreviewRenderer.render(data: Data("base: &base value\ncopy: *base".utf8), extension: "yml")
check(aliasesYAML.contains("Literal text") && aliasesYAML.contains("aliases"), "YAML anchors and aliases explicit fallback")
let blockYAML = PreviewRenderer.render(data: Data("text: |\n  untouched".utf8), extension: "yaml")
check(blockYAML.contains("Literal text") && blockYAML.contains("  untouched"), "YAML block scalar literal fallback")
let nestedYAML = PreviewRenderer.render(data: Data("outer:\n  inner: value".utf8), extension: "yaml")
check(nestedYAML.contains("Formatted YAML"), "nested YAML supported")
print("YAML tests passed")

let yamlIndicator = PreviewRenderer.render(data: Data("-: a\nlong: b".utf8), extension: "yaml")
check(yamlIndicator.contains("Literal text"), "YAML sequence indicator key falls back")
let yamlMarkerKey = PreviewRenderer.render(data: Data("---: a\nlong: b".utf8), extension: "yaml")
check(yamlMarkerKey.contains("Literal text"), "YAML document indicator key falls back")
let yamlTooMany = Array(repeating: "key: value", count: 5001).joined(separator: "\n")
check(PreviewRenderer.render(data: Data(yamlTooMany.utf8), extension: "yaml").contains("Literal text"), "YAML line bound")
print("YAML boundary tests passed")
let nestedCommon = "service:\n  name: web\n  enabled: true\n  ports:\n    - 080\n    - 443\n  labels:\n    env: prod\n    region_code: eu\nworkers:\n  - name: first\n    retries: 0002\n  - name: second\n    retries: 3\n"
let nestedPage = PreviewRenderer.render(data: Data(nestedCommon.utf8), extension: "yaml")
check(nestedPage.contains("Formatted YAML") && nestedPage.contains("    env        : prod") && nestedPage.contains("    - 080"), "nested mappings and lists")
let yamlFlow = PreviewRenderer.render(data: Data("options: [one, two]".utf8), extension: "yaml")
check(yamlFlow.contains("Literal text"), "flow YAML falls back")
let quotedYAML = PreviewRenderer.render(data: Data("name: \\\"quoted\\\"".utf8), extension: "yaml")
check(quotedYAML.contains("Literal text"), "quoted YAML falls back")
print("Nested YAML tests passed")

let alignedUnicodeYAML = PreviewRenderer.render(data: Data("key  : café\nlonger: 漢字".utf8), extension: "yml")
check(alignedUnicodeYAML.contains("Formatted YAML") && alignedUnicodeYAML.contains("key   : café") && alignedUnicodeYAML.contains("longer: 漢字"), "already aligned keys and Unicode words retain scalar text")

let displayXML = "<?xml version=\"1.0\"?><root type=\"demo\">&amp;</root>"
let displayXMLPage = PreviewRenderer.render(data: Data(displayXML.utf8), extension: "xml")
check(displayXMLPage.contains("<pre data-language=\"xml\">&lt;?xml"), "XML literal fallback remains eligible for lexical highlighting")
check(displayXMLPage.contains("&amp;amp;"), "XML fallback preserves entity spelling")

for (ext, filename, language) in [("SH", "example.SH", "bash"), ("py", "example.py", "python"),
                                 ("sql", "example.sql", "sql"), ("mk", "rules.mk", "makefile"),
                                 ("", "Makefile", "makefile"), ("", "GNUmakefile", "makefile")] {
    let page = PreviewRenderer.render(data: Data("<script>&".utf8), extension: ext, filename: filename)
    check(page.contains("<pre data-language=\"\(language)\">&lt;script&gt;&amp;"), "escaped standalone \(filename)")
}
check(PreviewRenderer.render(data: Data("hello".utf8), extension: "", filename: "README").contains("Unsupported"), "unrelated extensionless file")

let malformedTOML = PreviewRenderer.render(data: Data("[broken\nvalue = \"<script>&\"".utf8), extension: "TOML", filename: "bad.TOML")
check(malformedTOML.contains("<pre data-language=\"toml\">[broken") && malformedTOML.contains("&lt;script&gt;&amp;") && !malformedTOML.contains("<script>"), "malformed TOML stays escaped and eligible for highlighting")
let longTOML = String(repeating: "key = 12345\n", count: 4096) + "final_sentinel = true\n"
let longTOMLPage = PreviewRenderer.render(data: Data(longTOML.utf8), extension: "toml")
check(longTOMLPage.contains("data-language=\"toml\"") && longTOMLPage.contains("final_sentinel = true"), "long standalone TOML retains final sentinel")
check(PreviewRenderer.render(data: Data(repeating: 65, count: PreviewRenderer.limit + 1), extension: "toml").contains("1 MiB"), "oversized TOML is bounded")

for (ext, language) in [("h", "c"), ("cpp", "cpp"), ("js", "javascript"), ("css", "css")] {
    let page = PreviewRenderer.render(data: Data("<tag>& final_sentinel".utf8), extension: ext)
    check(page.contains("data-language=\"\(language)\"") && page.contains("&lt;tag&gt;&amp; final_sentinel"), "\(ext) source is escaped and requests \(language)")
}
for ext in ["yml", "yaml"] {
    let page = PreviewRenderer.render(data: Data("base: &anchor [<value>]\ncopy: *anchor".utf8), extension: ext)
    check(page.contains("Literal text") && page.contains("data-language=\"yaml\"") && page.contains("&amp;anchor [&lt;value&gt;]") && page.contains("*anchor"), "\(ext) literal fallback remains escaped and eligible for highlighting")
}
print("Source dispatch and YAML fallback tests passed")
