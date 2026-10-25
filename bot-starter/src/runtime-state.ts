/** Public-state bookkeeping used by the live bot. No opponent-private state. */
export const STANDARD_BAG_SIZE = 98;
export function auctionsRemaining(startingRackSize: number, participantCount: number, currentRound: number): number {
  // bagTotal is the *remaining* bag in the current server implementation; use
  // the official fixed distribution to also resume older constant-total rows.
  return Math.max(0, STANDARD_BAG_SIZE - startingRackSize * participantCount - currentRound + 1);
}
export function rackKey(rack: ReadonlyMap<string, number>): string {
  return [...rack].filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)).map(([c, n]) => `${c}${n}`).join("");
}
export function reconstructInitialRack(
  current: ReadonlyMap<string, number>,
  playedWords: Iterable<string>,
  acquiredLetters: Iterable<string>,
  expectedSize: number,
): Map<string, number> | undefined {
  const initial = new Map(current);
  for (const word of playedWords) for (const c of word) initial.set(c, (initial.get(c) ?? 0) + 1);
  for (const c of acquiredLetters) initial.set(c, (initial.get(c) ?? 0) - 1);
  if ([...initial.values()].some(n => n < 0)) return undefined;
  for (const [c, n] of initial) if (n === 0) initial.delete(c);
  return [...initial.values()].reduce((a, b) => a + b, 0) === expectedSize ? initial : undefined;
}
export function cappedBid(amount: number, balance: number): number {
  return Number.isFinite(amount) ? Math.max(0, Math.min(Math.floor(balance), Math.floor(amount))) : 0;
}
