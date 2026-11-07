import Foundation
import WebKit

// One disposable WebKit view renders trusted bundled code. Finder receives only
// the resulting static document. The fallback is built before WebKit is started.
@MainActor
final class QuickLookWebRenderer: NSObject, WKNavigationDelegate {
    private static var busy = false
    private var continuation: CheckedContinuation<String?, Never>?
    private var view: WKWebView?
    private var deadline: DispatchWorkItem?
    private var initialNavigation = true
    private let html: String

    private init(html: String) { self.html = html }

    static func enrich(_ html: String, scriptURL: URL? = Bundle.main.url(forResource: "quicklook-render", withExtension: "js")) async -> String? {
        guard !busy, html.utf8.count <= 1_500_000, html.contains("data-language="),
              let scriptURL,
              let script = try? String(contentsOf: scriptURL, encoding: .utf8),
              script.utf8.count <= 12_000_000 else { return nil }
        busy = true
        defer { busy = false }
        let renderer = QuickLookWebRenderer(html: html)
        return await renderer.run(script)
    }

    private func run(_ script: String) async -> String? {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .nonPersistent()
            configuration.userContentController.addUserScript(
                WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true, in: .defaultClient)
            )
            let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 900, height: 900), configuration: configuration)
            self.view = view
            view.navigationDelegate = self
            let deadline = DispatchWorkItem { [weak self] in self?.finish(nil) }
            self.deadline = deadline
            DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: deadline)
            view.loadHTMLString("""
                <!doctype html><meta charset="utf-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; base-uri 'none'; form-action 'none'">
                <body></body>
                """, baseURL: nil)
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
        continuation.resume(returning: value)
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let allowed = initialNavigation && action.targetFrame?.isMainFrame == true
            && action.request.url?.absoluteString == "about:blank"
        initialNavigation = false
        decisionHandler(allowed ? .allow : .cancel)
        if !allowed { finish(nil) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.callAsyncJavaScript("return await globalThis.markwriterQuickLookRender(html)",
                                     arguments: ["html": html], in: nil, in: .defaultClient) { [weak self] result in
            guard case let .success(value) = result, let page = value as? String,
                  page.utf8.count <= 4_500_000 else { self?.finish(nil); return }
            self?.finish(page)
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(nil) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(nil) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(nil) }
}
