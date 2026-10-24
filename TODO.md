# TODO

Things we're aware of but haven't done yet.

## Security / robustness

- [ ] **Per-bot identity in `submit_bid` / `submit_word` is implicit.**
  Bots authenticate via their `BotCredential`. If a token leaks, the
  holder can do anything that bot can do. Token recovery means minting a
  new credential — the old one keeps working until you actively delete
  the row. We don't expose a "revoke credential" reducer yet.

## Polish

- [ ] **Match views could show the lobby that produced them** and link
  back. Right now there's no breadcrumb from `/matches/:id` back to the
  lobby it came from.
