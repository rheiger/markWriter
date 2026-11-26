"""Verify the rasterized image types and fail-closed fences in the direct output."""
import argparse
import base64
from html.parser import HTMLParser
from pathlib import Path
import hashlib
import json
import re
import struct


class Output(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self.blocks = []
        self.details = False
        self.pre = None

    def handle_starttag(self, name, attributes):
        attrs = dict(attributes)
        if name == 'details':
            self.details = True
        if name == 'pre':
            self.pre = []
        if name == 'img':
            prefix = 'data:image/png;base64,'
            src = attrs.get('src', '')
            if not src.startswith(prefix):
                raise ValueError('Expected embedded PNG')
            png = base64.b64decode(src[len(prefix):], validate=True)
            if not png.startswith(b'\x89PNG\r\n\x1a\n') or png[12:16] != b'IHDR':
                raise ValueError('Invalid PNG header')
            width, height = struct.unpack('>II', png[16:24])
            if min(width, height) <= 1:
                raise ValueError('Invalid diagram dimensions')
            self.images.append({'alt': attrs['alt'], 'width': width, 'height': height,
                                'sha256': hashlib.sha256(png).hexdigest()})

    def handle_endtag(self, name):
        if name == 'pre':
            self.blocks.append((''.join(self.pre), self.details))
            self.pre = None
        if name == 'details':
            self.details = False

    def handle_data(self, text):
        if self.pre is not None:
            self.pre.append(text)


EXPECTED = {
    'app': ['PlantUML diagram', 'PlantUML diagram', None],
    'closed': ['PlantUML diagram', 'PlantUML diagram', None, None, None],
    'open': ['PlantUML diagram', 'PlantUML diagram', 'Mermaid diagram', 'DOT diagram'],
    'legacy': ['Mermaid diagram', 'DOT diagram', 'DBML diagram'],
    'negative': [None, None, None, None],
    'oversized': [None],
    'recovery': ['PlantUML diagram'],
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('case', choices=EXPECTED)
    parser.add_argument('markdown', type=Path)
    parser.add_argument('html', type=Path)
    args = parser.parse_args()
    rendered = Output()
    rendered.feed(args.html.read_text())
    expected = EXPECTED[args.case]
    sources = re.findall(r'^```[^\n]+\n(.*?)^```$', args.markdown.read_text(), re.M | re.S)
    if len(sources) != len(expected):
        raise ValueError('Unexpected number of fixture fences')
    if [x['alt'] for x in rendered.images] != [x for x in expected if x]:
        raise ValueError(f'Unexpected image types: {rendered.images}')
    if rendered.blocks != list(zip(sources, [bool(kind) for kind in expected])):
        raise ValueError('Visible fallback or source disclosure mismatch')
    print(json.dumps({'case': args.case, 'images': rendered.images, 'visibleSourceBlocks': expected.count(None),
                      'sourceBlocksMatched': len(sources)}))


if __name__ == '__main__':
    main()
