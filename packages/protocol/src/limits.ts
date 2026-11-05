/** Version of the envelope format (spec 7.4). */
export const PROTOCOL_VERSION = 1;

/** Highest content schema version this build understands. */
export const SUPPORTED_SCHEMA_VERSION = 1;

/** Largest envelope after encoding as JSON, in bytes: 64 KB (spec 7.4). */
export const MAX_ENVELOPE_BYTES = 64 * 1024;

/** Time to live of undelivered envelopes on the relay (NFR-SYNC-02). */
export const ENVELOPE_TTL_DAYS = 30;
export const ENVELOPE_TTL_MS = ENVELOPE_TTL_DAYS * 24 * 60 * 60 * 1000;
