import type { FileShare, SharedFile } from "./file-share";

interface ShareNavigator {
  canShare?: (data: { files: File[] }) => boolean;
  share?: (data: { files?: File[]; text?: string }) => Promise<void>;
}

const nav = (): ShareNavigator => navigator;

/** The person closed the share dialog: not a failure. */
const ignoreCancel = (error: unknown): void => {
  if ((error as { name?: string }).name !== "AbortError") throw error;
};

function download({ name, mimeType, text }: SharedFile): void {
  const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function shareFile(file: SharedFile): Promise<void> {
  const { name, mimeType, text } = file;
  const files = [new File([text], name, { type: mimeType })];
  const n = nav();
  if (n.canShare?.({ files }) === true && n.share) {
    await n.share({ files }).catch(ignoreCancel);
    return;
  }
  download(file);
}

async function shareText(text: string): Promise<void> {
  const n = nav();
  if (n.share) {
    await n.share({ text }).catch(ignoreCancel);
    return;
  }
  download({ name: "parapka.txt", mimeType: "text/plain", text });
}

/** Shares through `navigator.share`, or downloads the file when it cannot. */
export function createWebFileShare(): FileShare {
  return { shareFile, shareText };
}
