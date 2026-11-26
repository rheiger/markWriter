import AppKit
import WebKit
import Foundation

final class Probe: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
  let script: String
  var view: WKWebView!

  init(script: String) { self.script = script }
  func start(url: URL) {
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    config.userContentController.add(self, name: "result")
    view = WKWebView(frame: CGRect(x: 0, y: 0, width: 800, height: 600), configuration: config)
    view.navigationDelegate = self
    view.load(URLRequest(url: url))
    DispatchQueue.main.asyncAfter(deadline: .now() + 60) { fputs("Probe deadline exceeded\n", stderr); exit(1) }
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    webView.evaluateJavaScript(script + "\n;void 0") { _, error in
      if let error { fputs("Script injection failed: \(error)\n", stderr); exit(1) }
    }
  }
  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    fputs("Page load failed: \(error)\n", stderr); exit(1)
  }
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let text = message.body as? String else { fputs("Invalid result\n", stderr); exit(1) }
    print(text); fflush(stdout); exit(0)
  }
}

guard CommandLine.arguments.count == 3, let url = URL(string: CommandLine.arguments[1]) else { fatalError("Expected loopback URL and script path") }
let script = try String(contentsOfFile: CommandLine.arguments[2], encoding: .utf8)
let app = NSApplication.shared
let probe = Probe(script: script)
probe.start(url: url)
app.run()
