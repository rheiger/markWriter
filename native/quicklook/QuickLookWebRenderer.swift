import Foundation
import WebKit
import os

// One disposable WebKit view renders trusted bundled code. Finder receives only
// the resulting static document. The fallback is built before WebKit is started.
@MainActor
final class QuickLookWebRenderer: NSObject, WKNavigationDelegate {
    private static var busy = false
    private static let log = Logger(subsystem: "com.markwriter.app.quicklook", category: "renderer")
    private var continuation: CheckedContinuation<String?, Never>?
    private var view: WKWebView?
    private var deadline: DispatchWorkItem?
    private var initialNavigation = true
    private var ruleDirectory: URL?
    private let html: String

    private init(html: String) { self.html = html }

    static func enrich(_ html: String, scriptURL: URL? = Bundle(for: PreviewProvider.self).url(forResource: "quicklook-render", withExtension: "js")) async -> String? {
        guard !busy else { log.notice("Fallback: renderer busy"); return nil }
        guard html.utf8.count <= 1_500_000 else { log.notice("Fallback: document exceeds enrichment limit"); return nil }
        guard html.contains("data-language=") else { return nil }
        guard let scriptURL, let script = try? String(contentsOf: scriptURL, encoding: .utf8), script.utf8.count <= 12_000_000 else {
            log.error("Fallback: renderer resource unavailable or oversized"); return nil
        }
        log.info("Starting local renderer")
        busy = true
        defer { busy = false }
        let renderer = QuickLookWebRenderer(html: html)
        return await renderer.run(script)
    }

    private func run(_ script: String) async -> String? {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            let deadline = DispatchWorkItem { [weak self] in Self.log.error("Fallback: renderer timed out"); self?.finish(nil) }
            self.deadline = deadline
            DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: deadline)
            let directory = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
                .appendingPathComponent("markwriter-quicklook-rules-" + UUID().uuidString, isDirectory: true)
            do { try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true) }
            catch { Self.log.error("Fallback: cannot create isolated rule store"); self.finish(nil); return }
            self.ruleDirectory = directory
            guard let store = WKContentRuleListStore(url: directory) else { Self.log.error("Fallback: cannot open isolated rule store"); self.finish(nil); return }
            let rules = """
                [{"trigger":{"url-filter":"^https?://"},"action":{"type":"block"}},
                 {"trigger":{"url-filter":"^wss?://"},"action":{"type":"block"}},
                 {"trigger":{"url-filter":"^ftp://"},"action":{"type":"block"}},
                 {"trigger":{"url-filter":"^file://"},"action":{"type":"block"}}]
                """
            store.compileContentRuleList(forIdentifier: "offline", encodedContentRuleList: rules) { [weak self] list, _ in
                guard let self, self.continuation != nil else {
                    try? FileManager.default.removeItem(at: directory)
                    return
                }
                guard let list else { Self.log.error("Fallback: offline rules could not compile"); self.finish(nil); return }
                let configuration = WKWebViewConfiguration()
                configuration.websiteDataStore = .nonPersistent()
                configuration.userContentController.add(list)
                configuration.userContentController.addUserScript(
                    WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .defaultClient)
                )
                let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 900, height: 900), configuration: configuration)
                self.view = view
                view.navigationDelegate = self
                view.loadHTMLString("""
                    <!doctype html><meta charset="utf-8">
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src 'none'; script-src 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
                    <body></body>
                    """, baseURL: nil)
            }
        }
    }

    private func finish(_ value: String?) {
        guard let continuation else { return }
        self.continuation = nil
        deadline?.cancel()
        deadline = nil
        view?.navigationDelegate = nil
        view?.stopLoading()
        view = nil
        if let directory = ruleDirectory { try? FileManager.default.removeItem(at: directory); ruleDirectory = nil }
        continuation.resume(returning: value)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let allowed = initialNavigation && action.targetFrame?.isMainFrame == true
            && action.request.url?.absoluteString == "about:blank"
        initialNavigation = false
        decisionHandler(allowed ? .allow : .cancel)
        if !allowed { Self.log.error("Fallback: renderer navigation rejected"); finish(nil) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.callAsyncJavaScript("return await globalThis.markwriterQuickLookRender(html)",
                                     arguments: ["html": html], in: nil, in: .defaultClient) { [weak self] result in
            guard case let .success(value) = result, let page = value as? String,
                  page.utf8.count <= 4_500_000 else {
                Self.log.error("Fallback: renderer script failed or exceeded output limit"); self?.finish(nil); return
            }
            Self.log.info("Local renderer completed")
            self?.finish(page)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { Self.log.error("Fallback: renderer navigation failed"); finish(nil) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { Self.log.error("Fallback: renderer navigation failed"); finish(nil) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { Self.log.error("Fallback: WebKit content process terminated"); finish(nil) }
}
