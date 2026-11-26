// Direct packaged resource check in a disposable WKWebView.
import AppKit
import Foundation

@objc(PreviewProvider) final class PreviewProvider: NSObject {}

@main struct Probe {
    @MainActor static func main() async throws {
        _ = NSApplication.shared
        let args = Array(CommandLine.arguments.dropFirst())
        guard args.count == 3 else {
            fputs("Expected JS resource, synthetic Markdown file, and new HTML path\n", stderr)
            exit(2)
        }
        let script = URL(fileURLWithPath: args[0])
        let source = try String(contentsOfFile: args[1], encoding: .utf8)
        let fallback = "<!doctype html><html><head></head><body></body></html>"
        let start = ProcessInfo.processInfo.systemUptime
        guard let result = await QuickLookWebRenderer.enrich(fallback, markdown: source, scriptURL: script) else {
            fputs("The native renderer returned its whole-document fallback\n", stderr)
            exit(1)
        }
        let elapsed = Int((ProcessInfo.processInfo.systemUptime - start) * 1000)
        try Data(result.utf8).write(to: URL(fileURLWithPath: args[2]), options: .withoutOverwriting)
        var usage = rusage()
        getrusage(RUSAGE_SELF, &usage)
        print("rendererElapsedMs=\(elapsed) probeHighWaterRssBytes=\(usage.ru_maxrss)")
    }
}
