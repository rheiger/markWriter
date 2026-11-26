// Record Finder's accessibility tree without assuming WebKit exposes images.
import AppKit
import ApplicationServices
import Foundation

guard let finder = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first else {
    fputs("Finder is not running\n", stderr)
    exit(1)
}
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
var count = 0
func visit(_ element: AXUIElement, _ depth: Int) -> [String: Any] {
    count += 1
    var result: [String: Any] = [:]
    for name in [kAXRoleAttribute, kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute, kAXValueAttribute] {
        if let value = attribute(element, name), let text = value as? String { result[name] = text }
    }
    if depth < 24, count < 3000, let values = attribute(element, kAXChildrenAttribute) as? [AXUIElement] {
        var children: [[String: Any]] = []
        for value in values where count < 3000 { children.append(visit(value, depth + 1)) }
        if !children.isEmpty { result["children"] = children }
    }
    return result
}
let application = AXUIElementCreateApplication(finder.processIdentifier)
let windows = attribute(application, kAXWindowsAttribute) as? [AXUIElement] ?? []
let previews = windows.filter { attribute($0, kAXTitleAttribute) as? String == "Quick Look" }
guard previews.count == 1 else { fputs("Could not uniquely identify Quick Look accessibility window\n", stderr); exit(1) }
let root = visit(previews[0], 0)
let output = try JSONSerialization.data(withJSONObject: ["nodes": count, "tree": root], options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(output)
