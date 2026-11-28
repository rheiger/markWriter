# PI222 recovery 28baf491

```plantuml
@startuml
actor Client
participant Server
Client -> Server: RecoveryRequest
Server --> Client: NightReply
@enduml
```
