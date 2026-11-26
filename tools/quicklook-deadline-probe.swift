// Direct WebKit renderer probe, not Finder or packaged-extension acceptance.
import AppKit
import Foundation

// The default argument references PreviewProvider, but this probe always passes
// explicit synthetic script URLs and never loads a packaged extension.
@objc(PreviewProvider)
final class PreviewProvider: NSObject {}

@main
struct QuickLookDeadlineProbe {
    @MainActor static func main() async throws {
        _ = NSApplication.shared
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("markwriter-quicklook-deadline-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let successScript = root.appendingPathComponent("success.js")
        let stalledScript = root.appendingPathComponent("stalled.js")
        try "globalThis.markwriterQuickLookRender = async html => html;".write(to: successScript, atomically: true, encoding: .utf8)
        try "globalThis.markwriterQuickLookRender = async () => await new Promise(() => {});".write(to: stalledScript, atomically: true, encoding: .utf8)
        let source = "<!doctype html><html><body><pre data-language=\"dbml\">synthetic-source-sentinel</pre></body></html>"
        let first = await QuickLookWebRenderer.enrich(source, markdown: "synthetic", scriptURL: successScript)
        guard first == source else { throw NSError(domain: "QuickLookDeadlineProbe", code: 1, userInfo: [NSLocalizedDescriptionKey: "Success control failed"]) }
        let start = ProcessInfo.processInfo.systemUptime
        let timeout = await QuickLookWebRenderer.enrich(source, markdown: "synthetic", scriptURL: stalledScript)
        let elapsed = ProcessInfo.processInfo.systemUptime - start
        guard timeout == nil && elapsed >= 7 && elapsed < 20 else { throw NSError(domain: "QuickLookDeadlineProbe", code: 2, userInfo: [NSLocalizedDescriptionKey: "Deadline did not return nil within expected bounds: \(elapsed)s"]) }
        let recovered = await QuickLookWebRenderer.enrich(source, markdown: "synthetic", scriptURL: successScript)
        guard recovered == source else { throw NSError(domain: "QuickLookDeadlineProbe", code: 3, userInfo: [NSLocalizedDescriptionKey: "Renderer failed to recover after timeout"]) }
        let result: [String: Any] = ["successControl": true, "stalledScriptReturnedNil": true, "elapsedSeconds": elapsed, "recovered": true, "scope": "Direct synthetic WebKit renderer probe, not Finder or packaged extension"]
        let output = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
        FileHandle.standardOutput.write(output)
        print("")
    }
}
