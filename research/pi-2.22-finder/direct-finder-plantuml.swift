import AppKit
import Foundation
import Darwin

@objc(PreviewProvider) final class PreviewProvider: NSObject {}

@main struct Probe {
  @MainActor static func main() async throws {
    _ = NSApplication.shared
    guard CommandLine.arguments.count == 4 else { fatalError("Expected candidate script path, loopback base URL and synthetic secret path") }
    let script = URL(fileURLWithPath: CommandLine.arguments[1])
    let server = CommandLine.arguments[2]
    let secret = CommandLine.arguments[3]
    let html = "<!doctype html><html><head></head><body><p>synthetic native fallback</p></body></html>"
    let cases: [(String, String, Bool)] = [
      ("sequence-first", "@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml\n", true),
      ("sequence-warm", "@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml\n", true),
      ("class", "@startuml\nclass User {\n +id: int\n}\nclass Order {\n +id: int\n}\nUser \"1\" -- \"*\" Order: owns\n@enduml\n", true),
      ("class-private-field", "@startuml\nclass User {\n -id: int\n}\n@enduml\n", true),
      ("local-include", "@startuml\n!include " + secret + "\n@enduml\n", false),
      ("network-include", "@startuml\n!include " + server + "/synthetic.puml\n@enduml\n", false),
      ("remote-image", "@startuml\nAlice -> Bob: <img:" + server + "/synthetic.png>\n@enduml\n", false),
      ("missing-theme", "@startuml\n!theme missingtheme\n@enduml\n", false),
      ("malformed", "@startuml\nclass {\n@enduml\n", false),
      ("oversized", "@startuml\n" + String(repeating: "Alice -> Bob: Message\n", count: 500) + "@enduml\n", false),
      ("sequence-after-rejections", "@startuml\nactor Alice\nparticipant Bob\nAlice -> Bob: Request\n@enduml\n", true)
    ]
    var rows: [[String: Any]] = []
    for (name, source, expectImage) in cases {
      let markdown = "```plantuml\n" + source + "```\n"
      let start = ProcessInfo.processInfo.systemUptime
      let result = await QuickLookWebRenderer.enrich(html, markdown: markdown, scriptURL: script)
      let milliseconds = Int((ProcessInfo.processInfo.systemUptime - start) * 1000)
      let image = result?.contains("data:image/png;base64,") ?? false
      let escaped = source.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
      let sourcePreserved = result?.contains(escaped) ?? false
      let leakedSecret = result?.contains("SYNTHETIC-PLANTUML-SECRET") ?? false
      var usage = rusage()
      getrusage(RUSAGE_SELF, &usage)
      rows.append(["case": name, "elapsedMs": milliseconds, "renderReturned": result != nil, "image": image, "sourcePreserved": sourcePreserved, "secretLeaked": leakedSecret, "expectedImage": expectImage, "matched": image == expectImage && sourcePreserved && !leakedSecret, "probePeakRssBytes": usage.ru_maxrss])
    }
    let output = try JSONSerialization.data(withJSONObject: ["scope": "Direct WKWebView using a script copied from an experimental staged app; not packaged-provider or Finder acceptance", "cases": rows], options: [.prettyPrinted, .sortedKeys])
    FileHandle.standardOutput.write(output)
  }
}
