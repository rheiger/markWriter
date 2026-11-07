import Foundation

// Only compact, attribute-free, entity-free element trees are formatted. All other
// inputs retain their exact source in the caller's literal fallback.
final class SimpleXMLFormatter: NSObject, XMLParserDelegate {
    private struct Element {
        let name: String
        var text = ""
        var children: [String] = []
    }
    private var stack: [Element] = []
    private var root: String?
    private var failed = false
    private var count = 0

    static func format(_ source: String) -> String? {
        // Reject declarations, DTDs, comments, CDATA, processing instructions and
        // all entity references before invoking the parser; external resolution is off.
        guard !source.contains("<!"), !source.contains("<?"), !source.contains("&"),
              let data = source.data(using: .utf8) else { return nil }
        let delegate = SimpleXMLFormatter()
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        parser.shouldResolveExternalEntities = false
        guard parser.parse(), !delegate.failed, delegate.stack.isEmpty else { return nil }
        return delegate.root
    }

    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes attributeDict: [String: String]) {
        count += 1
        guard count <= 10_000, stack.count < 64, attributeDict.isEmpty,
              !elementName.contains(":"), stack.last?.text.isEmpty != false else {
            failed = true; parser.abortParsing(); return
        }
        stack.append(Element(name: elementName))
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard !stack.isEmpty else {
            if !string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { failed = true; parser.abortParsing() }
            return
        }
        guard stack[stack.count - 1].children.isEmpty else {
            failed = true; parser.abortParsing(); return
        }
        stack[stack.count - 1].text += string
    }

    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        guard let element = stack.popLast(), element.name == elementName else { failed = true; parser.abortParsing(); return }
        let depth = stack.count
        let indent = String(repeating: "  ", count: depth)
        let result: String
        if element.children.isEmpty {
            result = "\(indent)<\(element.name)>\(element.text)</\(element.name)>"
        } else {
            guard element.text.isEmpty else { failed = true; parser.abortParsing(); return }
            result = "\(indent)<\(element.name)>\n\(element.children.joined(separator: "\n"))\n\(indent)</\(element.name)>"
        }
        if stack.isEmpty {
            guard root == nil else { failed = true; parser.abortParsing(); return }
            root = result
        } else { stack[stack.count - 1].children.append(result) }
    }
}
