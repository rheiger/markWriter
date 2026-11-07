// Isolated experiment only: not embedded, registered, signed, or production-ready.
import Foundation
import QuickLookUI
import UniformTypeIdentifiers

@objc(PreviewProvider)
final class PreviewProvider: QLPreviewProvider, QLPreviewingController {
    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        let url = request.fileURL
        return QLPreviewReply(dataOfContentType: .html, contentSize: CGSize(width: 800, height: 800)) { _ in
            let data = try SafeFileReader.read(url)
            return Data(PreviewRenderer.render(data: data, extension: url.pathExtension).utf8)
        }
    }
}
