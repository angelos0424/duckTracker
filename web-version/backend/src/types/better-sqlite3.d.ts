import type { Buffer } from 'node:buffer';

declare module 'better-sqlite3' {
    export interface RunResult {
        changes: number;
        lastInsertRowid: number | bigint;
    }

    export interface Statement<BindParameters = unknown, ResultRow = unknown> {
        run(parameters?: BindParameters): RunResult;
        get(parameters?: BindParameters): ResultRow;
        all(parameters?: BindParameters): ResultRow[];
        iterate(parameters?: BindParameters): Iterable<ResultRow>;
        pluck(value?: boolean): this;
        expand(value?: boolean): this;
    }

    export interface RegisterOptions {
        name: string;
        deterministic?: boolean;
        safeIntegers?: boolean;
        varargs?: boolean;
    }

    export interface Transaction<Args extends unknown[]> {
        (...args: Args): unknown;
        default(...args: Args): unknown;
        deferred(...args: Args): unknown;
        immediate(...args: Args): unknown;
        exclusive(...args: Args): unknown;
    }

    export interface BackupMetadata {
        totalPages: number;
        remainingPages: number;
    }

    export interface BackupOptions {
        progress?: (info: BackupMetadata) => void;
        filter?: (page: number) => boolean;
    }

    export interface DatabaseOptions {
        memory?: boolean;
        fileMustExist?: boolean;
        timeout?: number;
        verbose?: (...params: unknown[]) => void;
        readonly?: boolean;
        nativeBinding?: string | Buffer;
    }

    export class Database<BindParameters = unknown> {
        constructor(filename: string, options?: DatabaseOptions);

        prepare<Bind extends BindParameters = BindParameters, Row = unknown>(sql: string): Statement<Bind, Row>;
        transaction<Args extends unknown[]>(fn: (...args: Args) => unknown): Transaction<Args>;
        exec(sql: string): this;
        pragma(query: string, options?: { simple?: boolean }): unknown;
        register(options: RegisterOptions, handler: (...args: unknown[]) => unknown): this;
        loadExtension(path: string): this;
        close(): void;
        dispose(): void;
    }

    export default Database;
    export { Database, Statement };
}
