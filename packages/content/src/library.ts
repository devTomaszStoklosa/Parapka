import type {
  ContentFile,
  EngineRule,
  HintTemplate,
  PhaseDescription,
  ValidationError,
  ValidationResult,
} from "./types.js";
import {
  validateEngineRuleFile,
  validateHintTemplateFile,
  validatePhaseFile,
} from "./validate.js";

export interface ContentLibrary {
  phases: ContentFile<PhaseDescription>;
  hintTemplates: ContentFile<HintTemplate>;
  engineRules: ContentFile<EngineRule>;
}

export type LoadResult =
  | { ok: true; library: ContentLibrary }
  | { ok: false; errors: ValidationError[] };

export const PHASES_FILE = "phases.json";
export const HINT_TEMPLATES_FILE = "hint-templates.json";
export const ENGINE_RULES_FILE = "engine-rules.json";

export const KNOWN_FILES: readonly string[] = [
  PHASES_FILE,
  HINT_TEMPLATES_FILE,
  ENGINE_RULES_FILE,
];

const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/**
 * Validates parsed content files, keyed by path, and builds the library.
 * Files with an unknown name and missing files are errors.
 */
export function loadLibrary(files: Record<string, unknown>): LoadResult {
  const errors: ValidationError[] = [];
  const byName = new Map<string, { path: string; data: unknown }>();
  for (const [path, data] of Object.entries(files)) {
    const name = baseName(path);
    if (!KNOWN_FILES.includes(name))
      errors.push({ file: path, entry: "", message: "unknown content file" });
    else byName.set(name, { path, data });
  }

  const load = <T>(
    name: string,
    validate: (file: string, data: unknown) => ValidationResult<T>,
  ): ContentFile<T> | undefined => {
    const found = byName.get(name);
    if (!found) {
      errors.push({
        file: name,
        entry: "",
        message: "content file is missing",
      });
      return undefined;
    }
    const result = validate(found.path, found.data);
    if (!result.ok) {
      errors.push(...result.errors);
      return undefined;
    }
    return result.value;
  };

  const phases = load(PHASES_FILE, validatePhaseFile);
  const hintTemplates = load(HINT_TEMPLATES_FILE, validateHintTemplateFile);
  const engineRules = load(ENGINE_RULES_FILE, validateEngineRuleFile);

  if (errors.length > 0 || !phases || !hintTemplates || !engineRules)
    return { ok: false, errors };
  return { ok: true, library: { phases, hintTemplates, engineRules } };
}

export function formatError(error: ValidationError): string {
  const entry = error.entry ? `: ${error.entry}` : "";
  return `${error.file}${entry}: ${error.message}`;
}
