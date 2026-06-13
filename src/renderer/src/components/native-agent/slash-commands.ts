/**
 * slash-commands — Definitions for chat input slash commands.
 *
 * Each command has an id (used programmatically), a label (displayed in the
 * menu) and a description (secondary text shown below the label).  The
 * actual execution logic lives in NativeAgentPane — this file is purely the
 * registry of what commands exist.
 */

export type SlashCommandDef = {
  id: string
  label: string
  description: string
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  {
    id: 'clear',
    label: '/clear',
    description: 'Clear the conversation history',
  },
  {
    id: 'help',
    label: '/help',
    description: 'Show available slash commands',
  },
]

/** Filter the command list by a user-typed prefix (text after "/"). */
export function filterSlashCommands(prefix: string): SlashCommandDef[] {
  if (!prefix) return SLASH_COMMANDS
  const lower = prefix.toLowerCase()
  return SLASH_COMMANDS.filter(
    (c) =>
      c.label.toLowerCase().includes(lower) ||
      c.description.toLowerCase().includes(lower)
  )
}
