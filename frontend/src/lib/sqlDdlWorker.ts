import { convertSqlDdl, type SqlDialect } from './sqlDdl'

self.onmessage = (event: MessageEvent<{ source: string; dialect: SqlDialect }>) => {
  try {
    const { source, dialect } = event.data
    self.postMessage({ result: convertSqlDdl(source, dialect) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message.slice(0, 512) : 'SQL conversion failed.' })
  }
}
