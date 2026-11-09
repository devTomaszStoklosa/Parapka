import { create } from "qrcode";

/**
 * Link of an invitation: `<app address>/pair#<invitation text>`. The text is in
 * the fragment, so it never reaches the server that serves the app.
 */
export function buildInvitationLink(appUrl: string, text: string): string {
  return `${appUrl.replace(/\/+$/, "")}/pair#${text}`;
}

/** Dark modules of a QR code, row by row. `qrcode` only computes the matrix. */
export function qrMatrix(text: string): boolean[][] {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  return Array.from({ length: modules.size }, (_, row) =>
    Array.from({ length: modules.size }, (_, column) =>
      Boolean(modules.get(row, column)),
    ),
  );
}
