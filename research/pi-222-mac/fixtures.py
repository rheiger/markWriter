"""Create fresh, single-file case folders for a package-specific Mac trial."""
import argparse
import hashlib
from pathlib import Path
import re

SEQUENCE = '@startuml\nactor Client\nparticipant Server\nClient -> Server: NightRequest\nServer --> Client: NightReply\n@enduml'
CLASSES = '@startuml\nclass User {\n -id: int\n}\nclass Order {\n +id: int\n}\nUser "1" -- "*" Order: owns\n@enduml'
THEME = '@startuml\n!theme missing\n@enduml'


def fence(language, text):
    return f'```{language}\n{text}\n```\n'


def documents():
    sequence = fence("plantuml", SEQUENCE)
    classes = fence("plantuml", CLASSES)
    theme = fence("plantuml", THEME)
    include = fence("plantuml", '@startuml\n!include file:///tmp/PI222-unavailable.puml\n@enduml')
    external = fence("plantuml", '@startuml\n!include http://127.0.0.1:9/PI222-unavailable.puml\n@enduml')
    legacy = [
        fence("mermaid", 'flowchart LR\n StartNode --> FinishNode'),
        fence("dot", 'digraph { InputNode -> OutputNode }'),
        fence("dbml", 'Table rows {\n id int [pk]\n}\nTable items {\n id int [pk]\n row_id int [ref: > rows.id]\n}'),
    ]
    return {
        "app": [sequence, classes, theme, '[Ordinary link](https://example.com/)\n'],
        "closed": [sequence, classes, theme, include, fence("plantuml", SEQUENCE.replace("NightRequest", "FifthBlock"))],
        "open": [classes, sequence, *legacy[:2]],
        "legacy": [*legacy],
        "negative": [fence("plantuml", '@startuml\nclass {\n@enduml'), theme, include, external],
        "oversized": [fence("plantuml", '@startuml\nactor Client\nparticipant Server\n' + 'Client -> Server: SourceOnly\n' * 400 + '@enduml')],
        "timeout": [fence("plantuml", SEQUENCE.replace("NightRequest", "TimeoutSentinel")),
                    fence("json", '[\n' + ',\n'.join(map(str, range(55000))) + '\n]')],
        "recovery": [fence("plantuml", SEQUENCE.replace("NightRequest", "RecoveryRequest"))],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path)
    parser.add_argument("nonce", help="Fresh 8–32 hexadecimal characters")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-fA-F0-9]{8,32}", args.nonce):
        parser.error("nonce must match [0-9a-fA-F]{8,32}")
    args.destination.mkdir(mode=0o700)
    records = []
    for case, sections in documents().items():
        directory = args.destination / case
        directory.mkdir()
        file = directory / f"{case}-{args.nonce}.md"
        file.write_text(f"# PI222 {case} {args.nonce}\n\n" + "\n".join(sections), encoding="utf-8")
        records.append(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.relative_to(args.destination)}")
    (args.destination / "SHA256SUMS").write_text("\n".join(records) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
