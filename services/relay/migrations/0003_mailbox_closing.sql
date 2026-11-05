-- A mailbox closed by one device stays until the partner has fetched and
-- acknowledged its envelopes, at most 30 days. NULL means the mailbox is open.
ALTER TABLE mailboxes ADD COLUMN closed_at_ms INTEGER;
