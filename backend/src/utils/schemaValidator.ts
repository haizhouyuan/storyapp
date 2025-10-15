import fs from 'fs';
import path from 'path';
import Ajv, { ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

type ValidateResult = { valid: true } | { valid: false; errors: ErrorObject[] };

let ajv: Ajv | null = null;
let outlineValidateFn: ((data: unknown) => boolean) | null = null;
let chapterValidateFn: ((data: unknown) => boolean) | null = null;

function getAjv(): Ajv {
  if (ajv) return ajv;
  ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

function loadSchema(schemaRelPath: string): unknown {
  const backendRoot = process.cwd();
  // 当后端以 backend/ 为 CWD 运行时，shared 位于 ../shared/
  const guess1 = path.resolve(backendRoot, schemaRelPath);
  const guess2 = path.resolve(backendRoot, '..', schemaRelPath);
  const file = fs.existsSync(guess1) ? guess1 : guess2;
  const raw = fs.readFileSync(file, 'utf8');
  return JSON.parse(raw);
}

export function validateDetectiveOutline(obj: unknown): ValidateResult {
  if (!outlineValidateFn) {
    const schema = loadSchema('shared/schema/detectiveOutline.schema.json');
    outlineValidateFn = getAjv().compile(schema as any);
  }
  const ok = outlineValidateFn(obj);
  if (ok) return { valid: true };
  return { valid: false, errors: (outlineValidateFn as any).errors || [] };
}


export type { ValidateResult };

export function validateSceneChapter(obj: unknown): ValidateResult {
  if (!chapterValidateFn) {
    const schema = loadSchema('shared/schema/chapter.schema.json');
    chapterValidateFn = getAjv().compile(schema as any);
  }
  const ok = chapterValidateFn(obj);
  if (ok) return { valid: true };
  return { valid: false, errors: (chapterValidateFn as any).errors || [] };
}

