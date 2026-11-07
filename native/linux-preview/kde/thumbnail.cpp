#include "render.h"
#include <KIO/ThumbnailCreator>
#include <KPluginFactory>

class MarkWriterThumbnail : public KIO::ThumbnailCreator {
    Q_OBJECT
public:
    using KIO::ThumbnailCreator::ThumbnailCreator;
    KIO::ThumbnailResult create(const KIO::ThumbnailRequest &request) override {
        if (!request.url().isLocalFile()) return KIO::ThumbnailResult::fail();
        const QImage image = renderMarkdownThumbnail(request.url().toLocalFile(), request.targetSize());
        return image.isNull() ? KIO::ThumbnailResult::fail() : KIO::ThumbnailResult::pass(image);
    }
};
K_PLUGIN_CLASS_WITH_JSON(MarkWriterThumbnail, "markwriterthumbnail.json")
#include "thumbnail.moc"
