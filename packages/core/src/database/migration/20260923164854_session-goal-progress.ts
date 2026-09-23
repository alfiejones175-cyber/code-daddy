import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260923164854_session-goal-progress",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_goal\` ADD \`progress\` text;`)
      yield* tx.run(`ALTER TABLE \`session_goal\` ADD \`blockers\` text DEFAULT '[]' NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
