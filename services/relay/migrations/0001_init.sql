-- Relay store, first schema. Only identifiers, keys, push tokens and sealed
-- envelopes: no names, e-mails or phone numbers (NFR-PRV-03).
CREATE TABLE devices (
  device_id TEXT PRIMARY KEY,
  signing_public_key TEXT NOT NULL,
  push_platform TEXT,
  push_token TEXT,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE challenges (
  challenge_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE TABLE invitations (
  invitation_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE TABLE mailboxes (
  pair_mailbox_id TEXT PRIMARY KEY,
  device_id_a TEXT NOT NULL,
  device_id_b TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE envelopes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  envelope_id TEXT NOT NULL UNIQUE,
  pair_mailbox_id TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at_ms INTEGER NOT NULL
);

CREATE INDEX envelopes_by_mailbox ON envelopes (pair_mailbox_id, seq);
