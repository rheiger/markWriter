declare module '@plantuml/core' {
  export function renderToString(lines: string[], success: (svg: string) => void, failure: (error: unknown) => void, options?: { maxSvgSize?: number }): void
}
