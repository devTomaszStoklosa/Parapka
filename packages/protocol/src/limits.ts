/** Version of the envelope format (`protocolVersion`, spec 7.4). */
export const PROTOCOL_VERSION = 1;

/** Highest content `schemaVersion` this build understands (NFR-SYNC-05). */
export const SUPPORTED_SCHEMA_VERSION = 1;

/** An envelope is at most 64 KB once encoded as JSON in UTF-8 (spec 7.4). */
export const MAX_ENVELOPE_BYTES = 64 * 1024;

/** Undelivered envelopes live 30 days on the relay (spec 7.4, NFR-SYNC-02). */
export const ENVELOPE_TTL_DAYS = 30;

export const ENVELOPE_TTL_MS = ENVELOPE_TTL_DAYS * 24 * 60 * 60 * 1000;
