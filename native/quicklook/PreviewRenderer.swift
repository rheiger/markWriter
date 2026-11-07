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
        <!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{font:16px -apple-system,system-ui;line-height:1.5;max-width:880px;margin:2em auto;padding:0 1em;color:CanvasText;background:Canvas;color-scheme:light dark}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:rgba(128,128,128,.12);padding:1em}p{white-space:pre-wrap;overflow-wrap:anywhere}.notice{opacity:.75}</style></head><body>\(body)</body></html>
        """
    }

    private static func literal(_ text: String, notice: String) -> String {
        page("<p class=\"notice\">\(escape(notice))</p><pre>\(escape(text))</pre>")
    }

    static func render(data: Data, extension ext: String) -> String {
        guard data.count <= limit else { return page("<p>File exceeds the 1 MiB preview limit.</p>") }
        guard let text = String(data: data, encoding: .utf8) else { return page("<p>Only UTF-8 text is supported.</p>") }
        switch ext.lowercased() {
        case "md", "markdown", "mdown", "mkd": return markdown(text)
        case "json":
            guard let result = JSONFormatter.format(text) else { return literal(text, notice: "Invalid JSON or formatting limit exceeded; showing Literal text.") }
            return page("<pre>\(escape(result))</pre>")
        case "jsonl", "ndjson":
            let lines = normalizedLines(text)
            guard lines.count <= 2000 else { return literal(text, notice: "JSON Lines exceeds 2,000 lines; showing Literal text.") }
            var formatted = [String]()
            var total = 0
            for (index, line) in lines.enumerated() {
                if line.trimmingCharacters(in: .whitespaces).isEmpty { continue }
                let result: String
                if let value = JSONFormatter.format(line, outputLimit: 2_097_152 - total) {
                    result = "Line \(index + 1)\n\(value)"
                } else {
                    result = "Line \(index + 1): invalid JSON or formatting limit exceeded\n\(line)"
                }
                total += result.utf8.count + 2
                guard total <= 2_097_152 else { return literal(text, notice: "JSON Lines exceeds output limit; showing Literal text.") }
                formatted.append(result)
            }
            return page("<p class=\"notice\">JSON Lines</p><pre>\(escape(formatted.joined(separator: "\n\n")))</pre>")
        case "xml":
            if let formatted = SimpleXMLFormatter.format(text) {
                return page("<p class=\"notice\">Formatted XML (element-only subset)</p><pre>\(escape(formatted))</pre>")
            }
            return literal(text, notice: "Literal text; XML is invalid or outside the supported element-only subset.")
        case "yaml", "yml": return literal(text, notice: "Literal text; YAML formatting is not supported in this prototype.")
        default: return literal(text, notice: "Unsupported file type; showing literal text.")
        }
    }

    private static func normalizedLines(_ text: String) -> [String] {
        text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n").components(separatedBy: "\n")
    }

    private static func markdown(_ text: String) -> String {
        var body = "<p class=\"notice\">Limited Markdown preview; inline formatting, images, links and diagrams appear as source.</p>"
        var code: [String] = []
        var paragraph: [String] = []
        var fence: Character? = nil
        var fenceLength = 0
        func flushParagraph() {
            if !paragraph.isEmpty { body += "<p>\(escape(paragraph.joined(separator: "\n")))</p>"; paragraph.removeAll() }
        }
        for line in normalizedLines(text) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let marker = trimmed.first
            let run = marker.map { c in trimmed.prefix(while: { $0 == c }).count } ?? 0
            if let current = fence {
                if marker == current && run >= fenceLength && trimmed.dropFirst(run).trimmingCharacters(in: .whitespaces).isEmpty {
                    body += "<pre><code>\(escape(code.joined(separator: "\n")))</code></pre>"; code.removeAll(); fence = nil
                } else { code.append(line) }
            } else if (marker == "`" || marker == "~") && run >= 3 {
                flushParagraph(); fence = marker; fenceLength = run
            } else if trimmed.isEmpty { flushParagraph() }
            else {
                let hashes = line.prefix(while: { $0 == "#" }).count
                if hashes > 0 && hashes <= 6 && line.dropFirst(hashes).first == " " {
                    flushParagraph(); body += "<h\(hashes)>\(escape(String(line.dropFirst(hashes + 1))))</h\(hashes)>"
                } else { paragraph.append(line) }
            }
        }
        if fence != nil { body += "<pre><code>\(escape(code.joined(separator: "\n")))</code></pre>" }
        flushParagraph()
        return page(body)
    }
}
