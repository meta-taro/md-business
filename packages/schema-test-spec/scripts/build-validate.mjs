import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';

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

const requireMap = new Map();
let cjsCounter = 0;
const rewritten = rawCode.replace(/require\(\s*"([^"]+)"\s*\)/g, (_, modulePath) => {
  let binding = requireMap.get(modulePath);
  if (!binding) {
    binding = `__cjs_${cjsCounter++}`;
    requireMap.set(modulePath, binding);
  }
  return binding;
});
const importHeader = Array.from(requireMap.entries())
  .map(([modulePath, binding]) => `import * as ${binding} from "${modulePath}";`)
  .join('\n');
const code = importHeader ? `${importHeader}\n${rewritten}` : rewritten;

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
