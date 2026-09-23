import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260923160027_session-goal",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_goal\` (
          \`session_id\` text PRIMARY KEY,
          \`objective\` text NOT NULL,
          \`acceptance_criteria\` text NOT NULL,
          \`budget\` integer,
          \`status\` text NOT NULL,
          \`evidence\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_session_goal_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`session_goal_status_idx\` ON \`session_goal\` (\`status\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
