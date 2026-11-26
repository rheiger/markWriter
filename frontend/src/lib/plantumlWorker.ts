// Fail closed until the qualified PlantUML runtime and strict parser can run
// inside this terminable worker with the existing CSP.
self.onmessage = (event: MessageEvent<{ id: number; owner: string }>) => {
  self.postMessage({ id: event.data.id, owner: event.data.owner, error: 'PlantUML runtime is not qualified' })
}
export {}
