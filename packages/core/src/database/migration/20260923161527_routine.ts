import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260923161527_routine",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`routine_run\` (
          \`id\` text PRIMARY KEY,
          \`routine_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`message_id\` text NOT NULL UNIQUE,
          \`scheduled_at\` integer NOT NULL,
          \`status\` text NOT NULL,
          \`admitted_seq\` integer,
          \`error\` text,
          \`claimed_at\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_routine_run_routine_id_routine_id_fk\` FOREIGN KEY (\`routine_id\`) REFERENCES \`routine\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_routine_run_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`routine\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`name\` text NOT NULL,
          \`prompt\` text NOT NULL,
          \`interval_ms\` integer NOT NULL,
          \`status\` text NOT NULL,
          \`next_run_at\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_routine_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`routine_run_routine_scheduled_at_idx\` ON \`routine_run\` (\`routine_id\`,\`scheduled_at\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`routine_run_status_claimed_at_idx\` ON \`routine_run\` (\`status\`,\`claimed_at\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`routine_run_routine_scheduled_at_unique\` ON \`routine_run\` (\`routine_id\`,\`scheduled_at\`);`,
      )
      yield* tx.run(`CREATE INDEX \`routine_status_next_run_at_idx\` ON \`routine\` (\`status\`,\`next_run_at\`);`)
      yield* tx.run(`CREATE INDEX \`routine_session_idx\` ON \`routine\` (\`session_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
