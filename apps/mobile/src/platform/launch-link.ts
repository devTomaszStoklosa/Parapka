/**
 * Reads the invitation text of `/pair#<text>` the app was opened with and
 * removes it from the address bar. The result is remembered, so a second call
 * (StrictMode runs effects twice) returns the same text.
 */
export function createLaunchLinkReader(
  location: Pick<Location, "pathname" | "hash">,
  history: Pick<History, "replaceState">,
): () => string | null {
  let read = false;
  let text: string | null = null;
  return () => {
    if (read) return text;
    read = true;
    const fragment = location.hash.replace(/^#/, "");
    if (location.pathname.replace(/\/+$/, "") === "/pair" && fragment !== "") {
      text = fragment;
      history.replaceState(null, "", location.pathname);
    }
    return text;
  };
}
