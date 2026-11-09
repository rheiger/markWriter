import Foundation

// Isolated experiment: deliberately limited and never evaluates document-supplied HTML.
enum PreviewRenderer {
    static let limit = 1_048_576

    private static func escape(_ value: String) -> String {
        value.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    private static func page(_ body: String) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><style>body{font:16px -apple-system,system-ui;line-height:1.5;max-width:880px;margin:2em auto;padding:0 1em;color:CanvasText;background:Canvas;color-scheme:light dark}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:rgba(128,128,128,.12);padding:1em}p{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;max-width:100%;margin:1em 0}th,td{border:1px solid GrayText;padding:.3em .6em;overflow-wrap:anywhere}th{background:rgba(128,128,128,.12)}:not(pre)>code{background:rgba(128,128,128,.12);padding:.1em .2em}.markdown-link{text-decoration:underline;text-decoration-style:dotted}.notice{opacity:.75}</style></head><body>\(body)</body></html>
        """
    }

    private static func literal(_ text: String, notice: String, language: String? = nil) -> String {
        let attribute = language.map { " data-language=\"\(escape($0))\"" } ?? ""
        return page("<p class=\"notice\">\(escape(notice))</p><pre\(attribute)>\(escape(text))</pre>")
    }

    static func render(data: Data, extension ext: String, filename: String? = nil) -> String {
        guard data.count <= limit else { return page("<p>File exceeds the 1 MiB preview limit.</p>") }
        guard let text = String(data: data, encoding: .utf8) else { return page("<p>Only UTF-8 text is supported.</p>") }
        if isMarkdown(ext) { return markdown(text) }
        switch ext.lowercased() {
        case "json":
            guard let result = JSONFormatter.format(text) else { return literal(text, notice: "Invalid JSON or formatting limit exceeded; showing Literal text.") }
            return page("<pre data-language=\"json\">\(escape(result))</pre>")
        case "jsonl", "ndjson":
            let lines = normalizedLines(text)
            guard lines.count <= 2000 else { return literal(text, notice: "JSON Lines exceeds 2,000 lines; showing Literal text.") }
            var formatted = [String]()
            var total = 0
            for (index, line) in lines.enumerated() {
                if line.trimmingCharacters(in: .whitespaces).isEmpty { continue }
                let result: String
                let record: String
                if let value = JSONFormatter.format(line, outputLimit: 2_097_152 - total) {
                    result = "Line \(index + 1)\n\(value)"
                    record = "<p>Line \(index + 1)</p><pre data-language=\"json\">\(escape(value))</pre>"
                } else {
                    result = "Line \(index + 1): invalid JSON or formatting limit exceeded\n\(line)"
                    record = "<p>Line \(index + 1): invalid JSON or formatting limit exceeded</p><pre>\(escape(line))</pre>"
                }
                total += result.utf8.count + 2
                guard total <= 2_097_152 else { return literal(text, notice: "JSON Lines exceeds output limit; showing Literal text.") }
                formatted.append(record)
            }
            return page("<p class=\"notice\">JSON Lines</p>\(formatted.joined(separator: "\n"))")
        case "xml":
            if let formatted = SimpleXMLFormatter.format(text) {
                return page("<p class=\"notice\">Formatted XML (element-only subset)</p><pre data-language=\"xml\">\(escape(formatted))</pre>")
            }
            return literal(text, notice: "Literal text; XML is invalid or outside the supported element-only subset.", language: "xml")
        case "yaml", "yml":
            if let formatted = formatSimpleYAML(text) {
                return page("<p class=\"notice\">Formatted YAML (block mapping/list subset; syntax not validated)</p><pre data-language=\"yaml\">\(escape(formatted))</pre>")
            }
            return literal(text, notice: "Literal text; quotes, block scalars, anchors, aliases, flow collections and other YAML constructs are not formatted.", language: "yaml")
        // Headers are ambiguous; treat .h as C without inferring its contents.
        case "h": return source(text, language: "c")
        case "cpp": return source(text, language: "cpp")
        case "js": return source(text, language: "javascript")
        case "css": return source(text, language: "css")
        case "sh", "bash": return source(text, language: "bash")
        case "py": return source(text, language: "python")
        case "sql": return source(text, language: "sql")
        case "toml": return source(text, language: "toml")
        case "mk", "mak": return source(text, language: "makefile")
        case "" where ["makefile", "gnumakefile"].contains(filename?.lowercased() ?? ""):
            return source(text, language: "makefile")
        default: return literal(text, notice: "Unsupported file type; showing literal text.")
        }
    }

    static func isMarkdown(_ ext: String) -> Bool {
        ["md", "markdown", "mdown", "mkd"].contains(ext.lowercased())
    }

    private static func source(_ text: String, language: String) -> String {
        page("<pre data-language=\"\(language)\">\(escape(text))</pre>")
    }

    private static func normalizedLines(_ text: String) -> [String] {
        text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").components(separatedBy: "\n")
    }

    // Formats a narrow block-style subset, without parsing or resolving values.
    // Source indentation and every scalar lexeme are preserved.
    private static func formatSimpleYAML(_ text: String) -> String? {
        let lines = normalizedLines(text)
        guard lines.count <= 5000 else { return nil }
        let keyChars = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")
        let valueChars = CharacterSet.letters.union(.decimalDigits).union(.nonBaseCharacters)
            .union(CharacterSet(charactersIn: "_-. "))
        var result: [String] = []
        var group: [(String, String, String)] = []
        var groupPrefix: String?
        var formattedAny = false
        var outputBytes = 0
        func emit(_ line: String) -> Bool {
            outputBytes += line.utf8.count + 1
            guard outputBytes <= 2_097_152 else { return false }
            result.append(line)
            return true
        }
        func flush() -> Bool {
            let width = group.map { $0.1.utf8.count }.max() ?? 0
            for (prefix, key, value) in group {
                guard emit(prefix + key + String(repeating: " ", count: width - key.utf8.count) + ":" + value) else { return false }
            }
            group.removeAll(); groupPrefix = nil
            return true
        }
        for line in lines {
            let indentCount = line.prefix(while: { $0 == " " }).count
            guard indentCount <= 128 else { return nil }
            let indent = String(line.prefix(indentCount))
            let rest = String(line.dropFirst(indentCount))
            if rest.isEmpty || (indentCount == 0 && (rest == "---" || rest == "...")) {
                guard flush(), emit(line) else { return nil }
                continue
            }
            let listItem = rest == "-" || rest.hasPrefix("- ")
            let content = listItem ? String(rest.dropFirst(min(2, rest.count))) : rest
            let prefix = indent + (listItem ? "- " : "")
            if listItem && !content.contains(":") {
                guard content.unicodeScalars.allSatisfy({ valueChars.contains($0) }), flush(), emit(line) else { return nil }
                formattedAny = true
                continue
            }
            guard let colon = content.firstIndex(of: ":") else { return nil }
            let key = String(content[..<colon]).trimmingCharacters(in: CharacterSet(charactersIn: " "))
            let value = String(content[content.index(after: colon)...])
            guard !key.isEmpty, key != "-", key != "---", key.utf8.count <= 64,
                  key.unicodeScalars.allSatisfy({ keyChars.contains($0) }),
                  value.isEmpty || value.first == " ",
                  value.unicodeScalars.allSatisfy({ valueChars.contains($0) }) else { return nil }
            if let existing = groupPrefix, existing != prefix { guard flush() else { return nil } }
            groupPrefix = prefix
            group.append((prefix, key, value)); formattedAny = true
        }
        guard flush(), formattedAny else { return nil }
        return result.joined(separator: "\n")
    }

    private static func markdown(_ text: String) -> String {
        var body = "<p class=\"notice\">Basic Markdown preview. Tables, inline formatting and diagrams appear as source.</p>"
        var code: [String] = []
        var paragraph: [String] = []
        var fence: Character? = nil
        var fenceLength = 0
        var fenceInfo = ""
        func codeBlock() -> String {
            let attribute = fenceInfo.isEmpty ? "" : " data-language=\"\(escape(fenceInfo))\""
            return "<pre><code\(attribute)>\(escape(code.joined(separator: "\n")))</code></pre>"
        }
        func flushParagraph() {
            if !paragraph.isEmpty { body += "<p>\(escape(paragraph.joined(separator: "\n")))</p>"; paragraph.removeAll() }
        }
        for line in normalizedLines(text) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let marker = trimmed.first
            let run = marker.map { c in trimmed.prefix(while: { $0 == c }).count } ?? 0
            if let current = fence {
                if marker == current && run >= fenceLength && trimmed.dropFirst(run).trimmingCharacters(in: .whitespaces).isEmpty {
                    body += codeBlock(); code.removeAll(); fence = nil
                } else { code.append(line) }
            } else if (marker == "`" || marker == "~") && run >= 3 {
                flushParagraph()
                fence = marker
                fenceLength = run
                fenceInfo = trimmed.dropFirst(run).split(whereSeparator: \.isWhitespace).first.map { String($0.prefix(64)).lowercased() } ?? ""
            } else if trimmed.isEmpty { flushParagraph() }
            else {
                let hashes = line.prefix(while: { $0 == "#" }).count
                if hashes > 0 && hashes <= 6 && line.dropFirst(hashes).first == " " {
                    flushParagraph(); body += "<h\(hashes)>\(escape(String(line.dropFirst(hashes + 1))))</h\(hashes)>"
                } else { paragraph.append(line) }
            }
        }
        if fence != nil { body += codeBlock() }
        flushParagraph()
        return page(body)
    }
}
