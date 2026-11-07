/** Generation changes on document, revision, mode and modal transitions. Native
 * clicks carry the last acknowledged generation, never a global late target. */
export function acceptsNativeCommand(event: { generation: number }, generation: number, modal: boolean) {
  return !modal && event.generation === generation
}
