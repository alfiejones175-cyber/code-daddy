# SQLite runtime capabilities

Both `sqlite.node.ts` and `sqlite.bun.ts` materialize statement results.
`executeStream` is unsupported and dies with a defect if called. Use bounded
queries or keyset pagination; do not use Effect SQL statement `.stream` with
these adapters until iterator cleanup, cancellation, transaction lifetime,
integer handling, and row transformations have implementation coverage.

This limitation is independent of HTTP/event streaming, which uses separate
mechanisms and remains supported.
