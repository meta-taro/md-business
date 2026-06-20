import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';
import ucs2lengthMod from 'ajv/dist/runtime/ucs2length.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'src/test-spec.schema.json');
const distDir = path.join(root, 'dist');
const outJs = path.join(distDir, 'validate.compiled.js');
const outDts = path.join(distDir, 'validate.compiled.d.ts');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

const ajv = new Ajv2020.default({
  allErrors: true,
  useDefaults: true,
  strict: false,
  code: { source: true, esm: true },
});
addFormats.default(ajv);

const validate = ajv.compile(schema);
const rawCode = standaloneCode.default(ajv, validate);

// Inline ajv runtime helpers so the compiled validator has zero ESM/CJS
// imports. Required to dodge esbuild's __toESM(mod, 1) interop which double-
// wraps `default` and breaks Apps Script execution (`func2 is not a function`).
const ucs2length = ucs2lengthMod.default || ucs2lengthMod;
const ucs2lengthInline = `const __md_ucs2length = ${ucs2length.toString()};`;

const requireFromHere = createRequire(import.meta.url);
const formatsPath = requireFromHere.resolve('ajv-formats/dist/formats.js');
const formatsSrc = fs.readFileSync(formatsPath, 'utf-8');
const formatsInline = `const __md_ajv_formats = (() => {
  const exports = {};
  ${formatsSrc}
  return exports;
})();`;

const patched = rawCode
  .replace(
    /require\(\s*"ajv\/dist\/runtime\/ucs2length"\s*\)\.default/g,
    '__md_ucs2length',
  )
  .replace(
    /require\(\s*"ajv\/dist\/runtime\/ucs2length"\s*\)/g,
    '({ default: __md_ucs2length })',
  )
  .replace(
    /require\(\s*"ajv-formats\/dist\/formats"\s*\)/g,
    '__md_ajv_formats',
  );

if (/require\(/.test(patched) || /__cjs_\d+/.test(patched)) {
  throw new Error(
    '[schema-test-spec] unexpected require() or __cjs_N binding left in compiled validator',
  );
}

const code = `${ucs2lengthInline}\n${formatsInline}\n${patched}`;

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(outJs, code);
fs.writeFileSync(
  outDts,
  [
    'import type { ErrorObject } from "ajv";',
    'declare const validate: ((data: unknown) => boolean) & {',
    '  errors?: ErrorObject[] | null;',
    '};',
    'export default validate;',
    '',
  ].join('\n'),
);

console.log(`[schema-test-spec] wrote ${path.relative(root, outJs)}`);
