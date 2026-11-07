import Foundation

// Retain every token verbatim; JSONSerialization is used solely as a validator.
// Bound nesting and produced bytes before asking Foundation to parse anything.
struct JSONFormatter {
    private var bytes: [UInt8]
    private var pos = 0
    private var output = [UInt8]()
    private let outputLimit: Int
    private let depthLimit = 32

    static func format(_ text: String, outputLimit: Int = 2_097_152) -> String? {
        var parser = JSONFormatter(bytes: Array(text.utf8), outputLimit: outputLimit)
        guard parser.value(depth: 0) else { return nil }
        parser.whitespace()
        guard parser.pos == parser.bytes.count,
              let data = text.data(using: .utf8),
              (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])) != nil else { return nil }
        return String(bytes: parser.output, encoding: .utf8)
    }

    private mutating func append(_ text: String) -> Bool {
        let added = Array(text.utf8)
        guard output.count + added.count <= outputLimit else { return false }
        output.append(contentsOf: added); return true
    }
    private mutating func whitespace() {
        while pos < bytes.count && [9, 10, 13, 32].contains(bytes[pos]) { pos += 1 }
    }
    private mutating func value(depth: Int) -> Bool {
        whitespace()
        guard pos < bytes.count, depth <= depthLimit else { return false }
        let ch = bytes[pos]
        if ch == 123 || ch == 91 { return container(depth: depth, object: ch == 123) }
        if ch == 34 { return string() }
        let start = pos
        while pos < bytes.count && ![9, 10, 13, 32, 44, 93, 125, 58].contains(bytes[pos]) { pos += 1 }
        guard pos > start else { return false }
        return append(String(decoding: bytes[start..<pos], as: UTF8.self))
    }
    private mutating func string() -> Bool {
        let start = pos
        pos += 1
        while pos < bytes.count {
            let c = bytes[pos]; pos += 1
            if c == 34 { return append(String(decoding: bytes[start..<pos], as: UTF8.self)) }
            if c == 92 {
                guard pos < bytes.count else { return false }
                pos += 1
            }
        }
        return false
    }
    private mutating func container(depth: Int, object: Bool) -> Bool {
        guard depth < depthLimit else { return false }
        let close: UInt8 = object ? 125 : 93
        guard append(object ? "{" : "[") else { return false }
        pos += 1; whitespace()
        if pos < bytes.count && bytes[pos] == close { pos += 1; return append(object ? "}" : "]") }
        var first = true
        while pos < bytes.count {
            guard append(first ? "\n" : ",\n"), append(String(repeating: "  ", count: depth + 1)) else { return false }
            first = false
            if object {
                whitespace(); guard pos < bytes.count && bytes[pos] == 34 && string() else { return false }
                whitespace(); guard pos < bytes.count && bytes[pos] == 58 && append(" : ") else { return false }
                pos += 1
            }
            guard value(depth: depth + 1) else { return false }
            whitespace(); guard pos < bytes.count else { return false }
            if bytes[pos] == close {
                pos += 1
                return append("\n") && append(String(repeating: "  ", count: depth)) && append(object ? "}" : "]")
            }
            guard bytes[pos] == 44 else { return false }
            pos += 1
        }
        return false
    }
}
