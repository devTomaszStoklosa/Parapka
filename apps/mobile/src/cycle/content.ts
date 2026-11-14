import { loadLibrary, type ContentLibrary } from "@parapka/content";

import engineRules from "../../../../content/engine-rules.json";
import hintTemplates from "../../../../content/hint-templates.json";
import phases from "../../../../content/phases.json";

/** The content files as `loadLibrary` takes them, keyed by path. */
export const CONTENT_FILES: Record<string, unknown> = {
  "phases.json": phases,
  "hint-templates.json": hintTemplates,
  "engine-rules.json": engineRules,
};

/** The validated library, or null when a file is invalid: then no hints. */
export function loadContent(
  files: Record<string, unknown> = CONTENT_FILES,
): ContentLibrary | null {
  const result = loadLibrary(files);
  return result.ok ? result.library : null;
}
