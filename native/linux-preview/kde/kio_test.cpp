#include "render.h"
#include <QApplication>
#include <QEventLoop>
#include <QFile>
#include <QPixmap>
#include <QTemporaryDir>
#include <QTimer>
#include <KFileItem>
#include <KIO/PreviewJob>
#include <cstdio>

int main(int argc, char **argv) {
    QApplication app(argc, argv);
    QTemporaryDir dir;
    if (!dir.isValid()) return 1;
    const QString path = dir.filePath("acceptance.md");
    QFile file(path);
    if (!file.open(QIODevice::WriteOnly) || file.write("# MarkWriter KIO Preview\n\n**Rendered** content\n") < 0) return 2;
    file.close();
    const auto expected = renderMarkdownThumbnail(path, {256, 256});
    if (expected.isNull()) return 3;
    const KFileItemList items{KFileItem(QUrl::fromLocalFile(path), QStringLiteral("text/markdown"))};
    const QStringList enabled{QStringLiteral("markwriterthumbnail")};
    auto *job = KIO::filePreview(items, {256, 256}, &enabled);
    job->setIgnoreMaximumSize(true);
    QImage actual;
    QEventLoop loop;
    QObject::connect(job, &KIO::PreviewJob::gotPreview, &loop, [&](const KFileItem &, const QPixmap &pixmap) { actual = pixmap.toImage(); });
    QObject::connect(job, &KJob::result, &loop, &QEventLoop::quit);
    QTimer::singleShot(15000, &loop, &QEventLoop::quit);
    loop.exec();
    if (actual.isNull()) { std::fputs("KIO did not generate a thumbnail\n", stderr); return 4; }
    if (actual.convertToFormat(QImage::Format_ARGB32) != expected.convertToFormat(QImage::Format_ARGB32)) {
        std::fputs("KIO thumbnail does not match the MarkWriter renderer\n", stderr); return 5;
    }
    if (argc > 1 && !actual.save(QString::fromLocal8Bit(argv[1]))) return 6;
    std::puts("KIO generated the expected MarkWriter thumbnail");
    return 0;
}
