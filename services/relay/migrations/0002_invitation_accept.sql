-- An accepted invitation keeps the sealed keys of device B until it expires,
-- so device A can fetch them. The relay does not read them.
ALTER TABLE invitations ADD COLUMN accepted_by_device_id TEXT;
ALTER TABLE invitations ADD COLUMN encrypted_keys_b TEXT;

CREATE INDEX mailboxes_by_device_a ON mailboxes (device_id_a);
CREATE INDEX mailboxes_by_device_b ON mailboxes (device_id_b);
