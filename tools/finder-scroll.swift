// Scroll only the uniquely identified Finder Quick Look window on the disposable runner.
import AppKit
import ApplicationServices
import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 2,
      ["vertical", "horizontal"].contains(CommandLine.arguments[1]),
      let finder = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first else { exit(1) }
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var value: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else { return nil }
    return value
}
let application = AXUIElementCreateApplication(finder.processIdentifier)
let windows = attribute(application, kAXWindowsAttribute) as? [AXUIElement] ?? []
let previews = windows.filter { attribute($0, kAXTitleAttribute) as? String == "Quick Look" }
guard previews.count == 1,
      let position = attribute(previews[0], kAXPositionAttribute),
      let size = attribute(previews[0], kAXSizeAttribute),
      CFGetTypeID(position) == AXValueGetTypeID(), CFGetTypeID(size) == AXValueGetTypeID() else { exit(1) }
var origin = CGPoint.zero
var dimensions = CGSize.zero
guard AXValueGetValue(position as! AXValue, .cgPoint, &origin),
      AXValueGetValue(size as! AXValue, .cgSize, &dimensions), dimensions.width > 100, dimensions.height > 100 else { exit(1) }
let center = CGPoint(x: origin.x + dimensions.width * 0.55, y: origin.y + dimensions.height * 0.55)
for type in [CGEventType.leftMouseDown, .leftMouseUp] {
    guard let event = CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: center, mouseButton: .left) else { exit(1) }
    event.post(tap: .cghidEventTap)
}
let vertical = CommandLine.arguments[1] == "vertical"
for _ in 0..<30 {
    guard let event = CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2,
                              wheel1: vertical ? -900 : 0, wheel2: vertical ? 0 : -900, wheel3: 0) else { exit(1) }
    event.post(tap: .cghidEventTap)
    usleep(10_000)
}
