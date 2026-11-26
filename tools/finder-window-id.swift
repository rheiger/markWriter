// Identify a single visible Finder Quick Look window, never capture the desktop.
import CoreGraphics
import Foundation

guard CommandLine.arguments.count == 2,
      let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
    fputs("Unable to enumerate windows\n", stderr); exit(1)
}
let expected = CommandLine.arguments[1]
let matches = windows.filter {
    guard $0[kCGWindowOwnerName as String] as? String == "Finder",
          let name = $0[kCGWindowName as String] as? String else { return false }
    return name == expected || name == "Quick Look"
}
guard matches.count == 1, let number = matches[0][kCGWindowNumber as String] as? Int else {
    fputs("Could not uniquely identify the Finder Quick Look window\n", stderr); exit(1)
}
print(number)
