#pragma once
#include <QImage>
#include <QSize>
#include <QString>

// Returns a null image for unsupported, invalid, or oversized input.
QImage renderMarkdownThumbnail(const QString &path, const QSize &size);
