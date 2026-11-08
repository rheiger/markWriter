import Foundation
import QuickLookUI
import UniformTypeIdentifiers

@objc(PreviewProvider)
final class PreviewProvider: QLPreviewProvider, QLPreviewingController {
    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        let url = request.fileURL
        // Other installed apps may use public.toml for generic configuration
        // files. Decline those requests before reading their contents.
        guard !["cfg", "config"].contains(url.pathExtension.lowercased()) else {
            throw CocoaError(.featureUnsupported)
        }
        let data = try SafeFileReader.read(url)
        let fallback = PreviewRenderer.render(data: data, extension: url.pathExtension, filename: url.lastPathComponent)
        let markdown = PreviewRenderer.isMarkdown(url.pathExtension) && data.count <= PreviewRenderer.limit
            ? String(data: data, encoding: .utf8) : nil
        let html = await QuickLookWebRenderer.enrich(fallback, markdown: markdown) ?? fallback
        let reply = Data(html.utf8)
        return QLPreviewReply(dataOfContentType: .html, contentSize: CGSize(width: 800, height: 800)) { _ in
            reply
        }
    }
}
