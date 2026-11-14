'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tests = fs.readdirSync(path.join(root, 'tests'))
  .filter(name => name.endsWith('.test.js') && !name.endsWith('-browser.test.js'))
  .sort();
let failures = 0;

for (const name of tests) {
  console.log(`\n--- ${name} ---`);
  const result = spawnSync(process.execPath, [path.join(root, 'tests', name)], {
    cwd: root,
    stdio: 'inherit'
  });
  if (result.error || result.status !== 0) {
    failures++;
    if (result.error) console.error(result.error.message);
  }
}

console.log(`\n${tests.length - failures}/${tests.length} arquivos de teste passaram.`);
process.exitCode = failures ? 1 : 0;
