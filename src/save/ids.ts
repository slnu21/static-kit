const GAME_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** gameId: 1–64 chars of `A-Z a-z 0-9 _ -` (no dots, so it can head a save code). */
export function assertGameId(gameId: unknown): asserts gameId is string {
  if (typeof gameId !== 'string' || !GAME_ID.test(gameId)) {
    throw new TypeError(`gameId must match ${GAME_ID}, got ${JSON.stringify(gameId)}`);
  }
}
