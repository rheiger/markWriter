#include "render.h"
#include <QApplication>
#include <QFile>
#include <QTemporaryDir>
#include <cstdio>

int main(int argc, char **argv) {
    QApplication app(argc, argv);
    QTemporaryDir dir;
    if (!dir.isValid()) return 1;
    QString path = dir.filePath("sample.md");
    auto write = [&](const QByteArray &data) { QFile f(path); return f.open(QIODevice::WriteOnly | QIODevice::Truncate) && f.write(data) == data.size(); };
    if (!write("# Heading\n\n**bold** and [link](https://example.test)\n![image](file:///etc/passwd)\n")) return 2;
    auto image = renderMarkdownThumbnail(path, {512, 512});
    if (image.isNull() || image.size() != QSize(512,512)) return 3;
    if (!renderMarkdownThumbnail(path, {0, 100}).isNull()) return 4;
    if (!write(QByteArray(256 * 1024 + 1, 'a')) || !renderMarkdownThumbnail(path, {256, 256}).isNull()) return 5;
    if (!write(QByteArray("\xff", 1)) || !renderMarkdownThumbnail(path, {256, 256}).isNull()) return 6;
    if (!write(QByteArray("a\0b", 3)) || !renderMarkdownThumbnail(path, {256, 256}).isNull()) return 7;
    if (!renderMarkdownThumbnail(dir.path(), {256, 256}).isNull()) return 8;
    std::puts("render tests passed");
    return 0;
}
