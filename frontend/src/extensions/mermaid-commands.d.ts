import '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mermaid: {
      insertMermaid: (chart: string) => ReturnType
    }
  }
}


