from pathlib import Path
import shutil
import sys

source = Path(__file__).resolve().parent / 'manual-fixtures'
target = Path(sys.argv[1])
target.mkdir(exist_ok=False)
for fixture in sorted(source.glob('*.md')):
    shutil.copyfile(fixture, target / fixture.name)

oversized = '@startuml\n' + 'Alice -> Bob: oversized source\n' * 400 + '@enduml\n'
(target / '04-oversized.md').write_text('# PI222-OVERSIZED-D0C7\n\n```plantuml\n' + oversized + '```\n', encoding='utf-8')
timeout = ('# PI222-TIMEOUT-E1B8\n\n```plantuml\n@startuml\nactor Alice\nparticipant Bob\n'
           'Alice -> Bob: TIMEOUTSENTINEL913\n@enduml\n```\n\n```json\n[\n'
           + ',\n'.join(map(str, range(55000))) + '\n]\n```\n')
(target / '05-timeout.md').write_text(timeout, encoding='utf-8')
(target / '06-recovery.md').write_text((source / '01-sequence.md').read_text(encoding='utf-8').replace('PI222-SEQUENCE-A7F4', 'PI222-RECOVERY-F2A9').replace('Request', 'RecoveryRequest'), encoding='utf-8')
