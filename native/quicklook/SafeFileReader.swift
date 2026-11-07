import Foundation
import Darwin

enum SafeFileReader {
    static func read(_ url: URL) throws -> Data {
        let fd = open(url.path, O_RDONLY | O_NONBLOCK | O_NOFOLLOW | O_CLOEXEC)
        guard fd >= 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        defer { _ = close(fd) }
        var info = stat()
        guard fstat(fd, &info) == 0 else { throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO) }
        guard (info.st_mode & S_IFMT) == S_IFREG else { throw POSIXError(.EINVAL) }
        var result = Data()
        var buffer = [UInt8](repeating: 0, count: 16_384)
        while result.count <= PreviewRenderer.limit {
            let remaining = PreviewRenderer.limit + 1 - result.count
            let count = Darwin.read(fd, &buffer, min(remaining, buffer.count))
            if count < 0 {
                if errno == EINTR { continue }
                throw POSIXError(POSIXErrorCode(rawValue: errno) ?? .EIO)
            }
            if count == 0 { break }
            result.append(contentsOf: buffer.prefix(count))
        }
        return result
    }
}
