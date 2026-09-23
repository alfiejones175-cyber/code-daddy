---
description: Create, inspect, or update this session's durable goal
---

Use the `goal` tool for this session. Interpret the user's arguments as an objective, a request to inspect the current goal, or an explicit pause, resume, or completion request. Ask for the missing objective only when setting a new goal and none can be inferred.

For a new goal, record a concrete objective and any acceptance criteria the user supplied. Do not invent a token budget. For status changes, preserve the saved objective and criteria. Mark a goal complete only when the objective and required checks have actually been achieved; record concise evidence. If work remains, report progress and keep the goal active. Do not schedule new work or replay interrupted side effects just because a goal exists.

After calling the tool, state the saved status and the next concrete step. If the tool is unavailable, say so rather than treating this message as a persisted goal.
