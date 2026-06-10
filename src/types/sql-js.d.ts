declare module 'sql.js' {
  export type SqlValue = string | number | Uint8Array | null

  export class Database {
    constructor(data?: Uint8Array | Buffer)
    run(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Database
    prepare(sql: string, params?: SqlValue[] | Record<string, SqlValue>): Statement
    export(): Uint8Array
  }

  export class Statement {
    step(): boolean
    getAsObject(): Record<string, unknown>
    free(): void
  }

  export type SqlJsStatic = {
    Database: typeof Database
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string
  }): Promise<SqlJsStatic>
}
