# PI222 recovery a831f905

```plantuml
@startuml
actor Client
participant Server
Client -> Server: RecoveryRequest
Server --> Client: NightReply
@enduml
```
