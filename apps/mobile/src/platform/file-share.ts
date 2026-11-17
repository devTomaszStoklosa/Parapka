export interface SharedFile {
  readonly name: string;
  readonly mimeType: string;
  readonly text: string;
}

/**
 * Hands a file or a text to the person through the system: the browser uses
 * the share dialog or a download, the native app the system sheet (M9). A
 * share that the person cancels is not an error; any other failure rejects.
 */
export interface FileShare {
  shareFile(file: SharedFile): Promise<void>;
  shareText(text: string): Promise<void>;
}

/** A file share that keeps what was shared, for tests. */
export function createMemoryFileShare(
  failWith?: Error,
): FileShare & { readonly files: SharedFile[]; readonly texts: string[] } {
  const files: SharedFile[] = [];
  const texts: string[] = [];
  const outcome = () =>
    failWith ? Promise.reject(failWith) : Promise.resolve();
  return {
    files,
    texts,
    shareFile: (file) => {
      files.push(file);
      return outcome();
    },
    shareText: (text) => {
      texts.push(text);
      return outcome();
    },
  };
}
