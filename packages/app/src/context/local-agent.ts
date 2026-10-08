export function hasCustomAgent(items: Array<{ native?: boolean }>) {
  return items.some((item) => item.native === false)
}

export function resolveAgent<T extends { name: string }>(
  items: T[],
  name?: string,
  options?: { visible: boolean; teams?: Record<string, { disabled?: boolean }> },
) {
  const team = name?.startsWith("team-") ? options?.teams?.[name.slice(5)] : undefined
  const selected = options?.visible === false && (!team || team.disabled) ? "build" : name
  return items.find((item) => item.name === selected) ?? items.find((item) => item.name === "build") ?? items[0]
}
