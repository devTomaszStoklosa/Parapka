import QRCode from "qrcode";

const PATH = "/pair#";

/** `<appUrl>/pair#<invitation text>`: the text stays in the fragment, so no server sees it. */
export function invitationLink(appUrl: string, text: string): string {
  return `${appUrl.replace(/\/+$/, "")}${PATH}${text}`;
}

/** The invitation text of a link made by `invitationLink`, or null for any other link. */
export function parseInvitationLink(link: string): string | null {
  const index = link.indexOf(PATH);
  if (index <= 0) return null;
  const text = link.slice(index + PATH.length);
  return text === "" ? null : text;
}

/** Square matrix of the QR code, `true` for a dark module. */
export function qrMatrix(link: string): boolean[][] {
  const { modules } = QRCode.create(link, { errorCorrectionLevel: "M" });
  const size = modules.size;
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => modules.get(row, column) === 1),
  );
}
