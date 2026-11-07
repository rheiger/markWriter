// Feasibility prototype only. Not embedded, registered, signed, or production-ready.
import Foundation
import QuickLookUI
import UniformTypeIdentifiers

@objc(PreviewProvider)
final class PreviewProvider: QLPreviewProvider, QLPreviewingController {
    func providePreview(for request: QLFilePreviewRequest) async throws -> QLPreviewReply {
        let url = request.fileURL
        return QLPreviewReply(dataOfContentType: .plainText, contentSize: CGSize(width: 800, height: 800)) { _ in
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            let data = try handle.read(upToCount: 1_048_577) ?? Data()
            guard data.count <= 1_048_576 else {
                return Data("File exceeds the prototype's 1 MiB preview limit.".utf8)
            }
            guard let text = String(data: data, encoding: .utf8) else {
                return Data("The prototype supports UTF-8 text only.".utf8)
            }
            return Data(text.utf8)
        }
    }
}
