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
        guard CommandLine.arguments.count == 3 else { throw NSError(domain: "QuickLookDeadlineProbe", code: 4, userInfo: [NSLocalizedDescriptionKey: "Expected loopback URL and synthetic file path"]) }
        let serverURL = CommandLine.arguments[1]
        let fileURL = URL(fileURLWithPath: CommandLine.arguments[2]).absoluteString
        func jsonString(_ value: String) throws -> String { String(decoding: try JSONEncoder().encode(value), as: UTF8.self) }
        let network = try jsonString(serverURL + "/fetch")
        let image = try jsonString(serverURL + "/image")
        let file = try jsonString(fileURL)
        let accessScript = root.appendingPathComponent("access.js")
        let js = """
        globalThis.markwriterQuickLookRender = async () => {
          const fetchResult = url => fetch(url).then(() => 'allowed', () => 'blocked');
          const imageResult = new Promise(resolve => {
            const image = new Image(); const timer = setTimeout(() => resolve('timeout'), 2000);
            image.onload = () => { clearTimeout(timer); resolve('allowed'); };
            image.onerror = () => { clearTimeout(timer); resolve('blocked'); };
            image.src = \(image);
          });
          return JSON.stringify(await Promise.all([fetchResult(\(network)), fetchResult(\(file)), imageResult]));
        };
        """
        try js.write(to: accessScript, atomically: true, encoding: .utf8)
        let successScript = root.appendingPathComponent("success.js")
        let stalledScript = root.appendingPathComponent("stalled.js")
        let promiseScript = root.appendingPathComponent("promise.js")
        try "globalThis.markwriterQuickLookRender = async html => html;".write(to: successScript, atomically: true, encoding: .utf8)
        try "globalThis.markwriterQuickLookRender = async () => await new Promise(() => {});".write(to: promiseScript, atomically: true, encoding: .utf8)
        try "globalThis.markwriterQuickLookRender = () => { const start = performance.now(); while (performance.now() - start < 15000) {} return 'late'; };".write(to: stalledScript, atomically: true, encoding: .utf8)
        let source = "<!doctype html><html><body><pre data-language=\"dbml\">synthetic-source-sentinel</pre></body></html>"
        let first = await QuickLookWebRenderer.enrich(source, markdown: "synthetic", scriptURL: successScript)
        guard first == source else { throw NSError(domain: "QuickLookDeadlineProbe", code: 1, userInfo: [NSLocalizedDescriptionKey: "Success control failed"]) }
        let access = await QuickLookWebRenderer.enrich(source, markdown: "synthetic", scriptURL: accessScript)
        guard access == "[\"blocked\",\"blocked\",\"blocked\"]" else { throw NSError(domain: "QuickLookDeadlineProbe", code: 5, userInfo: [NSLocalizedDescriptionKey: "Synthetic WebKit access probe was not blocked: \(access ?? "nil")"]) }
        let promiseStart = ProcessInfo.processInfo.systemUptime
        let promise = await QuickLookWebRenderer.enrich(source, markdown: "synthetic", scriptURL: promiseScript)
        let promiseElapsed = ProcessInfo.processInfo.systemUptime - promiseStart
        guard promise == nil else { throw NSError(domain: "QuickLookDeadlineProbe", code: 6, userInfo: [NSLocalizedDescriptionKey: "Pending Promise unexpectedly succeeded"]) }
        let start = ProcessInfo.processInfo.systemUptime
        let timeout = await QuickLookWebRenderer.enrich(source, markdown: "synthetic", scriptURL: stalledScript)
        let elapsed = ProcessInfo.processInfo.systemUptime - start
        guard timeout == nil && elapsed >= 7 && elapsed < 20 else { throw NSError(domain: "QuickLookDeadlineProbe", code: 2, userInfo: [NSLocalizedDescriptionKey: "Deadline did not return nil within expected bounds: \(elapsed)s"]) }
        let recovered = await QuickLookWebRenderer.enrich(source, markdown: "synthetic", scriptURL: successScript)
        guard recovered == source else { throw NSError(domain: "QuickLookDeadlineProbe", code: 3, userInfo: [NSLocalizedDescriptionKey: "Renderer failed to recover after timeout"]) }
        let result: [String: Any] = ["successControl": true, "loopbackFetchBlocked": true, "localFileFetchBlocked": true, "loopbackImageBlocked": true, "pendingPromiseReturnedNil": true, "pendingPromiseElapsedSeconds": promiseElapsed, "cpuBoundScriptReturnedNil": true, "cpuBoundElapsedSeconds": elapsed, "recovered": true, "scope": "Direct synthetic WebKit renderer probe, not Finder or packaged extension"]
        let output = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
        FileHandle.standardOutput.write(output)
        print("")
    }
}
