import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const ENVIRONMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['environment', 'add'],
    summary: 'Save a remote AnthraSpace runtime environment from a pairing code',
    usage: 'orca environment add --name <name> --pairing-code <code> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name'],
    examples: ['orca environment add --name work-laptop --pairing-code orca://pair#...']
  },
  {
    path: ['environment', 'list'],
    summary: 'List saved AnthraSpace runtime environments',
    usage: 'orca environment list [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['environment', 'show'],
    summary: 'Show one saved AnthraSpace runtime environment',
    usage: 'orca environment show --environment <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['environment', 'rm'],
    summary: 'Remove one saved AnthraSpace runtime environment',
    usage: 'orca environment rm --environment <selector> [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  }
]

