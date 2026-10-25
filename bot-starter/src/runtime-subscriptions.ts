/** Bounded live subscriptions: never download the competition's global history. */
export function credentialQueries(identityHex: string): string[] {
  if (!/^[0-9a-f]{64}$/i.test(identityHex)) throw new Error("Invalid credential identity");
  return [`SELECT * FROM bot_credential WHERE identity = 0x${identityHex}`];
}
export function coreQueries(botId: bigint): string[] {
  if (botId < 0n) throw new Error("Invalid bot id");
  return [
    `SELECT * FROM bot WHERE id = ${botId}`,
    `SELECT * FROM match_participant WHERE bot_id = ${botId}`,
    `SELECT match_state.* FROM match_state JOIN match_participant ON match_state.id = match_participant.match_id WHERE match_participant.bot_id = ${botId}`,
    `SELECT * FROM lobby_member WHERE bot_id = ${botId}`,
    `SELECT lobby.* FROM lobby JOIN lobby_member ON lobby.id = lobby_member.lobby_id WHERE lobby_member.bot_id = ${botId}`,
    "SELECT * FROM tournament",
    `SELECT * FROM tournament_entry WHERE bot_id = ${botId}`,
  ];
}
export function matchQueries(matchId: bigint, botId: bigint): string[] {
  if (matchId < 0n || botId < 0n) throw new Error("Invalid match or bot id");
  return [
    `SELECT * FROM match_participant WHERE match_id = ${matchId}`,
    `SELECT bot.* FROM bot JOIN match_participant ON bot.id = match_participant.bot_id WHERE match_participant.match_id = ${matchId}`,
    `SELECT * FROM auction WHERE match_id = ${matchId}`,
    `SELECT * FROM auction_result WHERE match_id = ${matchId}`,
    `SELECT * FROM word_play WHERE match_id = ${matchId} AND bot_id = ${botId}`,
    `SELECT * FROM my_rack WHERE match_id = ${matchId}`,
  ];
}
