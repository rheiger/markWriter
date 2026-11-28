"""Inspect a saved standalone app export and its exact two-diagram synthetic source."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from lxml import html

def check(value, description):
    if not value:
        raise ValueError(description)

def one(items, description):
    check(len(items) == 1, description)
    return items[0]

def inspect(source, output):
    doc = html.fromstring(output)
    fences = re.findall(r'^\x60\x60\x60plantuml\n(.+?)^\x60\x60\x60$', source, re.M | re.S)
    check(len(fences) == 3, 'Expected exactly three source fences')
    heading = one(re.findall(r'^# (.*)$', source, re.M), 'One source heading')
    check(one(doc.xpath('//h1'), 'One exported heading').text_content() == heading, 'Wrong heading')
    blocks = doc.xpath('//*[@data-type="plantuml"]')
    check(len(blocks) == 3, 'Three PlantUML output blocks')
    seq, cls = [one(b.xpath('./svg'), 'Expected an inline diagram') for b in blocks[:2]]
    check(len(doc.xpath('//svg')) == 2, 'Unexpected extra SVG')
    source_messages = re.findall(r'^(\w+) (-+>) (\w+): (\w+)$', fences[0], re.M)
    check(len(source_messages) == 2, 'Two expected messages')
    labels = [s.text_content() for s in seq.iter('text')]
    sender, _, receiver, request = source_messages[0]
    reply = source_messages[1][3]
    check(source_messages[1][:3] == (receiver, '-->', sender), 'Expected a dashed return message')
    check(all(item in labels for item in [sender, receiver, request, reply]), 'Sequence text mismatch')
    arrows = list(seq.iter('polygon'))
    lines = [e for e in seq.iter('line') if e.get('y1') == e.get('y2')]
    check(len(arrows) == len(lines) == 2, 'Two horizontal messages with arrowheads')
    for i in range(2):
        xs = [float(pair.split(',')[0]) for pair in arrows[i].get('points').split()]
        check(len(xs) == 4 and ((xs[1] > xs[0]) if i == 0 else (xs[1] < xs[0])), 'Message direction mismatch')
        check(bool(lines[i].get('stroke-dasharray')) == bool(i), 'Message dash style mismatch')
    check(float(lines[0].get('y1')) < float(lines[1].get('y1')), 'Message order mismatch')
    class_labels = [s.text_content() for s in cls.iter('text')]
    check(class_labels.count('id: int') == 2 and all(label in class_labels for label in ['User', 'Order', 'owns', '1', '*']), 'Class relationship/field labels')
    check(any(e.get('stroke','').lower() == '#c82930' for e in cls.iter('rect')), 'Private field marker')
    check(any(e.get('stroke','').lower() == '#038048' for e in cls.iter('circle')), 'Public field marker')
    check(any('C' in e.get('d','') and e.get('stroke') for e in cls.iter('path')), 'Association edge')
    check(one(blocks[2].xpath('./pre'), 'Readable fallback block').text_content() == fences[2], 'Exact fallback source')
    a = one(doc.xpath('//a'), 'Expected a single ordinary link')
    check(a.get('href') == 'https://example.com/' and a.text_content().lower() == 'ordinary link', 'Ordinary link')
    check(not doc.xpath('//script|//img|//link|//object|//iframe|//embed|//base|//video|//audio|//source'), 'Unexpected active or external resource element')
    for e in doc.iter():
        if not isinstance(e.tag,str):
            continue
        for k, v in e.attrib.items():
            check(not k.lower().startswith('on') and k.lower() not in ('src','srcset','data','action','poster','xlink:href'), 'Unexpected active/resource attribute')
            check((k != 'href' or e is a) and not re.search(r'url\s*\(\s*(?!#)',v,re.I), 'Unexpected resource attribute')
    check(not any(re.search(r'@import|url\s*\(',style.text_content(),re.I) for style in doc.iter('style')), 'CSS resource reference')
    return {'heading':heading,'svgCount':2,'sequenceLabels':labels,'classLabels':class_labels,'matchedArrowDirectionsAndDashes':True,'checkedAssociationAndFieldMarkers':True,'exactFallback':fences[2],'ordinaryLink':a.get('href'),'staticElementsChecked':True,'exportBytes':len(output),'exportSha256':hashlib.sha256(output).hexdigest()}

if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path)
    p.add_argument('html',type=Path)
    args=p.parse_args()
    raw=args.source.read_bytes()
    print(json.dumps(dict(sourceSha256=hashlib.sha256(raw).hexdigest(), **inspect(raw.decode('utf-8'),args.html.read_bytes())),indent=2))
