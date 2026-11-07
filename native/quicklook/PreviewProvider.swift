import Foundation
import QuickLookUI
import UniformTypeIdentifiers

@objc(PreviewProvider)
final class PreviewProvider: QLPreviewProvider, QLPreviewingController {
    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        let url = request.fileURL
        let data = try SafeFileReader.read(url)
        let fallback = PreviewRenderer.render(data: data, extension: url.pathExtension)
        let html = await QuickLookWebRenderer.enrich(fallback) ?? fallback
        let reply = Data(html.utf8)
        return QLPreviewReply(dataOfContentType: .html, contentSize: CGSize(width: 800, height: 800)) { _ in
            reply
        }
    }
}
