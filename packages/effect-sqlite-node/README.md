# Node SQLite adapter

This adapter supports materialized statement results through `execute`,
`executeRaw`, `executeValues`, and `executeUnprepared`, including transactions.

Row streaming (`executeStream`, including Effect SQL statement `.stream`) is
**not supported**. Invoking it currently terminates the stream with a defect;
it does not return a typed SQL error. Callers must use bounded queries or
keyset pagination rather than assume streaming is available.

The Core adapters in `packages/core/src/database/sqlite.node.ts` and
`sqlite.bun.ts` have the same limitation. No active consumer requiring streaming
was established by the September 2026 audit. A future implementation must test
early cancellation, iterator cleanup, transaction lifetime, safe integer mode,
and row transformations before advertising this capability.
