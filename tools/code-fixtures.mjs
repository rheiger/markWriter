// Editor projections normalize line endings; aggregate Save As expectations must
// keep the separately captured original file bytes.
export function codeFixtureCases(source) {
  return [...source.replace(/\r\n?/g, '\n').matchAll(/^```([^\n]*)\n([\s\S]*?)\n```$/gm)]
}
