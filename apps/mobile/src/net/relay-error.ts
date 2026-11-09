export type RelayErrorKind =
  | "unauthorized"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "expired"
  | "tooLarge"
  | "rateLimited"
  | "invalid"
  | "server"
  | "network";

/** The only error the relay client throws; screens never see raw responses. */
export class RelayError extends Error {
  constructor(
    readonly kind: RelayErrorKind,
    readonly status: number | null = null,
  ) {
    super(`relay error: ${kind}`);
    this.name = "RelayError";
  }
}

/** Maps an HTTP status of a failed response to an error kind. */
export function kindOfStatus(status: number): RelayErrorKind {
  switch (status) {
    case 400:
      return "invalid";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "notFound";
    case 409:
      return "conflict";
    case 410:
      return "expired";
    case 413:
      return "tooLarge";
    case 429:
      return "rateLimited";
    default:
      return "server";
  }
}
