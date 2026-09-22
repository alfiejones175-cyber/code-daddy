import { Navigate } from "@solidjs/router"
import { useLanguage } from "~/context/language"

export default function BlackWorkspace() {
  const language = useLanguage()
  // Workspace enrollment has no implemented destination yet. Keep direct links
  // on the existing plan page instead of rendering fabricated workspace IDs.
  return <Navigate href={language.route("/black")} />
}
