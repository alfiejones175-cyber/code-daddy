import jev from "../../packages/jev/src/plugin"
import { server } from "../../packages/jev/src/legacy"

// Both loaders discover this directory while the app transitions to V2.
export default { ...jev, server }
