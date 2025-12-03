import { Mode } from '@prisma/client';

export function getMode(mode: string | null) {
  if (!mode) return Mode.FIXED;
  if (mode.toLowerCase() === 'fija') return Mode.FIXED;
  if (mode.toLowerCase() === 'domo') return Mode.DOME;
  return Mode.BOTH;
}
