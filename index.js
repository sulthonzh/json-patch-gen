'use strict';

/**
 * json-patch-gen
 * Generate RFC 6902 JSON Patch operations by comparing two JSON values.
 * Zero dependencies.
 */

// --- Path helpers ---

/**
 * Escape a path segment per RFC 6901 (JSON Pointer).
 * '~' → '~0', '/' → '~1'
 */
function escapeSegment(segment) {
  if (typeof segment !== 'string') segment = String(segment);
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Build a JSON Pointer string from an array of segments.
 */
function buildPath(segments) {
  if (segments.length === 0) return '';
  return '/' + segments.map(escapeSegment).join('/');
}

// --- Deep equality ---

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

// --- Diff engine ---

/**
 * Generate RFC 6902 JSON Patch operations to transform `source` into `target`.
 *
 * @param {*} source - Original value
 * @param {*} target - Desired value
 * @param {object} [options] - Options
 * @param {boolean} [options.arrays=true] - Diff arrays element-by-element (vs replace whole array)
 * @param {string[]} [options._path] - Internal: current path segments
 * @returns {Array} Array of patch operations
 */
function diff(source, target, options) {
  options = options || {};
  if (options.arrays === undefined) options.arrays = true;
  const path = options._path || [];

  // Same reference or deep equal — no ops needed
  if (deepEqual(source, target)) return [];

  // If types differ or both are primitives, just replace
  if (
    source === null || target === null ||
    typeof source !== 'object' || typeof target !== 'object' ||
    Array.isArray(source) !== Array.isArray(target)
  ) {
    return [{ op: 'replace', path: buildPath(path), value: target }];
  }

  const ops = [];

  if (Array.isArray(source) && Array.isArray(target)) {
    if (options.arrays) {
      // Element-by-element diff for arrays
      // Remove extra elements from end of source
      if (source.length > target.length) {
        // Remove from end to avoid index shifting issues
        for (let i = source.length - 1; i >= target.length; i--) {
          ops.push({ op: 'remove', path: buildPath(path.concat(i)) });
        }
      }
      // Process matching elements
      for (let i = 0; i < Math.min(source.length, target.length); i++) {
        const itemPath = path.concat(i);
        if (!deepEqual(source[i], target[i])) {
          if (
            source[i] !== null && target[i] !== null &&
            typeof source[i] === 'object' && typeof target[i] === 'object' &&
            Array.isArray(source[i]) === Array.isArray(target[i])
          ) {
            ops.push(...diff(source[i], target[i], { ...options, _path: itemPath }));
          } else {
            ops.push({ op: 'replace', path: buildPath(itemPath), value: target[i] });
          }
        }
      }
      // Add new elements at end
      for (let i = source.length; i < target.length; i++) {
        ops.push({ op: 'add', path: buildPath(path.concat(i)), value: target[i] });
      }
    } else {
      // Replace entire array
      ops.push({ op: 'replace', path: buildPath(path), value: target });
    }
  } else if (!Array.isArray(source) && !Array.isArray(target)) {
    // Object diff
    const sourceKeys = Object.keys(source);
    const targetKeys = Object.keys(target);
    const targetKeySet = new Set(targetKeys);

    // Removed keys
    for (const key of sourceKeys) {
      if (!targetKeySet.has(key)) {
        ops.push({ op: 'remove', path: buildPath(path.concat(key)) });
      }
    }

    // Added or changed keys
    for (const key of targetKeys) {
      const itemPath = path.concat(key);
      if (!Object.prototype.hasOwnProperty.call(source, key)) {
        ops.push({ op: 'add', path: buildPath(itemPath), value: target[key] });
      } else if (!deepEqual(source[key], target[key])) {
        if (
          source[key] !== null && target[key] !== null &&
          typeof source[key] === 'object' && typeof target[key] === 'object' &&
          Array.isArray(source[key]) === Array.isArray(target[key])
        ) {
          ops.push(...diff(source[key], target[key], { ...options, _path: itemPath }));
        } else {
          ops.push({ op: 'replace', path: buildPath(itemPath), value: target[key] });
        }
      }
    }
  }

  return ops;
}

// --- Apply patch ---

/**
 * Apply a JSON Patch to a document (immutable — returns new value).
 *
 * @param {*} doc - Original document
 * @param {Array} patch - Array of RFC 6902 operations
 * @returns {*} New document with patch applied
 * @throws {Error} On invalid patch operations
 */
function applyPatch(doc, patch) {
  // Deep clone to avoid mutation
  let result = JSON.parse(JSON.stringify(doc));

  for (const op of patch) {
    result = applyOp(result, op);
  }

  return result;
}

function applyOp(doc, op) {
  switch (op.op) {
    case 'add':
      return applyAdd(doc, op.path, op.value);
    case 'remove':
      return applyRemove(doc, op.path);
    case 'replace':
      return applyReplace(doc, op.path, op.value);
    case 'move':
      return applyMove(doc, op.from, op.path);
    case 'copy':
      return applyCopy(doc, op.from, op.path);
    case 'test':
      return applyTest(doc, op.path, op.value);
    default:
      throw new Error(`Unknown operation: ${op.op}`);
  }
}

/**
 * Parse a JSON Pointer string into an array of unescaped segments.
 */
function parsePointer(pointer) {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON Pointer: ${pointer}`);
  return pointer.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/**
 * Navigate to the parent of a path and return { parent, key }.
 */
function navigateTo(doc, segments) {
  let current = doc;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (Array.isArray(current)) {
      current = current[parseInt(seg, 10)];
    } else if (current && typeof current === 'object') {
      current = current[seg];
    } else {
      throw new Error(`Cannot navigate into ${typeof current} at segment "${seg}"`);
    }
  }
  return { parent: current, key: segments[segments.length - 1] };
}

function applyAdd(doc, pointer, value) {
  const segments = parsePointer(pointer);

  // Root replacement
  if (segments.length === 0) {
    return JSON.parse(JSON.stringify(value));
  }

  const cloned = JSON.parse(JSON.stringify(doc));
  const { parent, key } = navigateTo(cloned, segments);

  if (Array.isArray(parent)) {
    const idx = key === '-' ? parent.length : parseInt(key, 10);
    if (key === '-') {
      parent.push(JSON.parse(JSON.stringify(value)));
    } else {
      parent.splice(idx, 0, JSON.parse(JSON.stringify(value)));
    }
  } else if (parent && typeof parent === 'object') {
    parent[key] = JSON.parse(JSON.stringify(value));
  } else {
    throw new Error(`Cannot add to ${typeof parent}`);
  }

  return cloned;
}

function applyRemove(doc, pointer) {
  const segments = parsePointer(pointer);
  if (segments.length === 0) {
    throw new Error('Cannot remove root');
  }

  const cloned = JSON.parse(JSON.stringify(doc));
  const { parent, key } = navigateTo(cloned, segments);

  if (Array.isArray(parent)) {
    parent.splice(parseInt(key, 10), 1);
  } else if (parent && typeof parent === 'object') {
    delete parent[key];
  }

  return cloned;
}

function applyReplace(doc, pointer, value) {
  const segments = parsePointer(pointer);

  if (segments.length === 0) {
    return JSON.parse(JSON.stringify(value));
  }

  const cloned = JSON.parse(JSON.stringify(doc));
  const { parent, key } = navigateTo(cloned, segments);

  if (Array.isArray(parent)) {
    parent[parseInt(key, 10)] = JSON.parse(JSON.stringify(value));
  } else if (parent && typeof parent === 'object') {
    parent[key] = JSON.parse(JSON.stringify(value));
  }

  return cloned;
}

function applyMove(doc, fromPointer, toPointer) {
  const fromSegments = parsePointer(fromPointer);
  const toSegments = parsePointer(toPointer);

  // Extract value
  let val;
  if (fromSegments.length === 0) {
    val = doc;
  } else {
    const { parent, key } = navigateTo(doc, fromSegments);
    val = Array.isArray(parent) ? parent[parseInt(key, 10)] : parent[key];
  }

  // Remove then add (simplified, not optimal for all edge cases)
  let result = applyRemove(doc, fromPointer);
  result = applyAdd(result, toPointer, val);
  return result;
}

function applyCopy(doc, fromPointer, toPointer) {
  const fromSegments = parsePointer(fromPointer);
  let val;
  if (fromSegments.length === 0) {
    val = doc;
  } else {
    const { parent, key } = navigateTo(doc, fromSegments);
    val = Array.isArray(parent) ? parent[parseInt(key, 10)] : parent[key];
  }

  return applyAdd(doc, toPointer, val);
}

function applyTest(doc, pointer, expected) {
  const segments = parsePointer(pointer);
  let actual;
  if (segments.length === 0) {
    actual = doc;
  } else {
    const { parent, key } = navigateTo(doc, segments);
    actual = Array.isArray(parent) ? parent[parseInt(key, 10)] : parent[key];
  }

  if (!deepEqual(actual, expected)) {
    throw new Error(`Test failed at ${pointer}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }

  return JSON.parse(JSON.stringify(doc));
}

// --- Reverse patch ---

/**
 * Create a reverse patch that undoes the given patch.
 * For each operation in reverse order, generate the inverse.
 *
 * @param {*} source - The original document (before patch)
 * @param {Array} patch - The patch to reverse
 * @returns {Array} A new patch that undoes the original
 */
function reversePatch(source, patch) {
  const reversed = [];
  let current = JSON.parse(JSON.stringify(source));

  for (const op of patch) {
    const segments = parsePointer(op.path);

    switch (op.op) {
      case 'add': {
        // Reverse of add is remove (if it was a new key/index)
        reversed.unshift({ op: 'remove', path: op.path });
        break;
      }
      case 'remove': {
        // Reverse of remove is add with the old value
        let oldVal;
        if (segments.length === 0) {
          oldVal = current;
        } else {
          const { parent, key } = navigateTo(current, segments);
          oldVal = Array.isArray(parent) ? parent[parseInt(key, 10)] : parent[key];
        }
        reversed.unshift({ op: 'add', path: op.path, value: oldVal });
        break;
      }
      case 'replace': {
        // Reverse of replace is replace with old value
        let oldVal;
        if (segments.length === 0) {
          oldVal = current;
        } else {
          const { parent, key } = navigateTo(current, segments);
          oldVal = Array.isArray(parent) ? parent[parseInt(key, 10)] : parent[key];
        }
        reversed.unshift({ op: 'replace', path: op.path, value: oldVal });
        break;
      }
      case 'move': {
        // Reverse of move is move back
        reversed.unshift({ op: 'move', from: op.path, path: op.from });
        break;
      }
      case 'copy': {
        // Reverse of copy is remove
        reversed.unshift({ op: 'remove', path: op.path });
        break;
      }
      case 'test': {
        // Test is a no-op, reverse is the same test
        reversed.unshift({ op: 'test', path: op.path, value: op.value });
        break;
      }
    }

    // Apply forward to track state
    current = applyOp(current, op);
  }

  return reversed;
}

// --- Exports ---

module.exports = {
  diff,
  applyPatch,
  reversePatch,
  // Utility exports
  escapeSegment,
  buildPath,
  parsePointer,
  deepEqual,
};
