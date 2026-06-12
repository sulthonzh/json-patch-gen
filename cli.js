#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { diff, applyPatch, reversePatch } = require('./index');

function usage() {
  console.log(`json-patch-gen — Generate RFC 6902 JSON Patch by comparing two JSON files

Usage:
  json-patch-gen diff <source.json> <target.json>   Generate patch operations
  json-patch-gen apply <doc.json> <patch.json>       Apply patch to document
  json-patch-gen reverse <source.json> <patch.json>  Generate reverse patch
  json-patch-gen validate <patch.json>               Validate patch structure

Options:
  --pretty     Pretty-print JSON output (default)
  --compact    Compact JSON output
  --no-arrays  Replace entire arrays instead of element-by-element diff
  -h, --help   Show this help

Examples:
  json-patch-gen diff old.json new.json
  json-patch-gen apply doc.json patch.json
  json-patch-gen reverse original.json patch.json
  echo '{"a":1}' | json-patch-gen diff - '{"a":2}'
`);
}

function readJSON(filepath) {
  if (filepath === '-') {
    return JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  }
  const resolved = path.resolve(filepath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function writeJSON(data, pretty) {
  if (pretty) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(JSON.stringify(data));
  }
}

function validatePatch(patch) {
  if (!Array.isArray(patch)) {
    return { valid: false, error: 'Patch must be an array' };
  }

  const validOps = ['add', 'remove', 'replace', 'move', 'copy', 'test'];

  for (let i = 0; i < patch.length; i++) {
    const op = patch[i];
    if (!op.op || !validOps.includes(op.op)) {
      return { valid: false, error: `Operation ${i}: invalid op "${op.op}"` };
    }
    if (typeof op.path !== 'string') {
      return { valid: false, error: `Operation ${i}: missing or invalid path` };
    }
    if ((op.op === 'move' || op.op === 'copy') && typeof op.from !== 'string') {
      return { valid: false, error: `Operation ${i}: ${op.op} requires "from"` };
    }
    if ((op.op === 'add' || op.op === 'replace' || op.op === 'test') && !('value' in op)) {
      return { valid: false, error: `Operation ${i}: ${op.op} requires "value"` };
    }
  }

  return { valid: true };
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    usage();
    process.exit(0);
  }

  const pretty = !args.includes('--compact');
  const noArrays = args.includes('--no-arrays');

  // Filter out flags
  const positional = args.filter(a => !a.startsWith('-'));

  const command = positional[0];

  try {
    switch (command) {
      case 'diff': {
        if (positional.length < 3) {
          console.error('Usage: json-patch-gen diff <source.json> <target.json>');
          process.exit(1);
        }
        const source = readJSON(positional[1]);
        const target = readJSON(positional[2]);
        const options = {};
        if (noArrays) options.arrays = false;
        const patch = diff(source, target, options);
        writeJSON(patch, pretty);
        break;
      }

      case 'apply': {
        if (positional.length < 3) {
          console.error('Usage: json-patch-gen apply <doc.json> <patch.json>');
          process.exit(1);
        }
        const doc = readJSON(positional[1]);
        const patch = readJSON(positional[2]);
        const validation = validatePatch(patch);
        if (!validation.valid) {
          console.error(`Invalid patch: ${validation.error}`);
          process.exit(1);
        }
        const result = applyPatch(doc, patch);
        writeJSON(result, pretty);
        break;
      }

      case 'reverse': {
        if (positional.length < 3) {
          console.error('Usage: json-patch-gen reverse <source.json> <patch.json>');
          process.exit(1);
        }
        const source = readJSON(positional[1]);
        const patch = readJSON(positional[2]);
        const reversed = reversePatch(source, patch);
        writeJSON(reversed, pretty);
        break;
      }

      case 'validate': {
        if (positional.length < 2) {
          console.error('Usage: json-patch-gen validate <patch.json>');
          process.exit(1);
        }
        const patch = readJSON(positional[1]);
        const validation = validatePatch(patch);
        if (validation.valid) {
          console.log('✓ Valid patch');
        } else {
          console.error(`✗ Invalid: ${validation.error}`);
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        usage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
