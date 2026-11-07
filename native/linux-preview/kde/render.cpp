#include "render.h"
#include <QAbstractTextDocumentLayout>
#include <QFile>
#include <QFileInfo>
#include <QPainter>
#include <QStringDecoder>
#include <QTextDocument>
#include <QUrl>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

namespace {
constexpr qint64 maxBytes = 256 * 1024;
class OfflineDocument : public QTextDocument {
protected:
    QVariant loadResource(int, const QUrl &) override { return {}; }
};
}
QImage renderMarkdownThumbnail(const QString &path, const QSize &size)
{
    if (size.width() < 1 || size.height() < 1 || size.width() > 2048 || size.height() > 2048)
        return {};
    const QByteArray nativePath = QFile::encodeName(path);
    int fd = ::open(nativePath.constData(), O_RDONLY | O_CLOEXEC | O_NONBLOCK | O_NOFOLLOW);
    if (fd < 0) return {};
    struct stat statbuf{};
    if (::fstat(fd, &statbuf) != 0 || !S_ISREG(statbuf.st_mode) || statbuf.st_size > maxBytes) {
        ::close(fd);
        return {};
    }
    QFile file;
    if (!file.open(fd, QIODevice::ReadOnly, QFileDevice::AutoCloseHandle)) {
        ::close(fd);
        return {};
    }
    const QByteArray bytes = file.read(maxBytes + 1);
    if (file.error() != QFile::NoError || bytes.size() > maxBytes || bytes.contains('\0')) return {};
    QStringDecoder decoder(QStringDecoder::Utf8);
    const QString text = decoder.decode(bytes);
    if (decoder.hasError()) return {};
    OfflineDocument document;
    document.setDefaultStyleSheet(QStringLiteral("body { color: #202020; }"));
    document.setMarkdown(text, QTextDocument::MarkdownFeatures(QTextDocument::MarkdownDialectGitHub) | QTextDocument::MarkdownNoHTML);
    document.setTextWidth(600);
    const QSize canvas(size.width(), size.height());
    QImage image(canvas, QImage::Format_ARGB32_Premultiplied);
    if (image.isNull()) return {};
    image.fill(QColor(248, 241, 227));
    QPainter painter(&image);
    painter.setClipRect(image.rect());
    painter.scale(canvas.width() / 620.0, canvas.width() / 620.0);
    painter.translate(10, 10);
    document.drawContents(&painter);
    return image;
}
