'use strict';

const { diff, applyPatch, reversePatch, escapeSegment, buildPath, parsePointer, deepEqual } = require('./index');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
    console.error(`    expected: ${e}`);
    console.error(`    actual:   ${a}`);
  }
}

function assertThrows(fn, msg) {
  try {
    fn();
    failed++;
    console.error(`  ✗ ${msg} (did not throw)`);
  } catch {
    passed++;
  }
}

// ========== deepEqual ==========
console.log('deepEqual');
assert(deepEqual(null, null), 'null === null');
assert(deepEqual(1, 1), 'number equality');
assert(!deepEqual(1, 2), 'number inequality');
assert(deepEqual('a', 'a'), 'string equality');
assert(deepEqual(true, true), 'bool equality');
assert(deepEqual([1, 2], [1, 2]), 'array equality');
assert(!deepEqual([1, 2], [1, 3]), 'array inequality');
assert(deepEqual({ a: 1 }, { a: 1 }), 'object equality');
assert(!deepEqual({ a: 1 }, { a: 2 }), 'object inequality');
assert(deepEqual({ a: { b: [1] } }, { a: { b: [1] } }), 'nested equality');

// ========== Path helpers ==========
console.log('path helpers');
assertEqual(escapeSegment('foo'), 'foo', 'escape plain');
assertEqual(escapeSegment('a/b'), 'a~1b', 'escape slash');
assertEqual(escapeSegment('a~b'), 'a~0b', 'escape tilde');
assertEqual(escapeSegment('a/b~c'), 'a~1b~0c', 'escape both');
assertEqual(buildPath([]), '', 'empty path');
assertEqual(buildPath(['a', 'b']), '/a/b', 'simple path');
assertEqual(buildPath(['a', 'b/c']), '/a/b~1c', 'path with special chars');
assertEqual(parsePointer(''), [], 'parse empty');
assertEqual(parsePointer('/a/b'), ['a', 'b'], 'parse simple');
assertEqual(parsePointer('/a~1b~0c'), ['a/b~c'], 'parse escaped');

// ========== diff: primitives ==========
console.log('diff: primitives');
assertEqual(diff(1, 2), [{ op: 'replace', path: '', value: 2 }], 'number replace');
assertEqual(diff('a', 'b'), [{ op: 'replace', path: '', value: 'b' }], 'string replace');
assertEqual(diff(null, 'x'), [{ op: 'replace', path: '', value: 'x' }], 'null to string');
assertEqual(diff(1, 1), [], 'same primitive');

// ========== diff: objects ==========
console.log('diff: objects');
assertEqual(
  diff({ a: 1 }, { a: 2 }),
  [{ op: 'replace', path: '/a', value: 2 }],
  'simple replace'
);
assertEqual(
  diff({ a: 1 }, { a: 1, b: 2 }),
  [{ op: 'add', path: '/b', value: 2 }],
  'add key'
);
assertEqual(
  diff({ a: 1, b: 2 }, { a: 1 }),
  [{ op: 'remove', path: '/b' }],
  'remove key'
);
assertEqual(
  diff({}, {}),
  [],
  'empty objects'
);
assertEqual(
  diff({ a: 1, b: 2, c: 3 }, { a: 1, c: 3 }),
  [{ op: 'remove', path: '/b' }],
  'remove middle key'
);
assertEqual(
  diff({ a: 1 }, { a: 2, b: 3 }),
  [{ op: 'replace', path: '/a', value: 2 }, { op: 'add', path: '/b', value: 3 }],
  'replace and add'
);

// ========== diff: nested objects ==========
console.log('diff: nested objects');
assertEqual(
  diff({ a: { b: 1 } }, { a: { b: 2 } }),
  [{ op: 'replace', path: '/a/b', value: 2 }],
  'nested replace'
);
assertEqual(
  diff({ a: { b: 1, c: 2 } }, { a: { b: 1 } }),
  [{ op: 'remove', path: '/a/c' }],
  'nested remove'
);
assertEqual(
  diff({ a: { b: 1 } }, { a: { b: 1, c: { d: 3 } } }),
  [{ op: 'add', path: '/a/c', value: { d: 3 } }],
  'nested add object'
);

// ========== diff: arrays ==========
console.log('diff: arrays');
assertEqual(
  diff([1, 2, 3], [1, 2, 4]),
  [{ op: 'replace', path: '/2', value: 4 }],
  'array element replace'
);
assertEqual(
  diff([1, 2], [1, 2, 3]),
  [{ op: 'add', path: '/2', value: 3 }],
  'array append'
);
assertEqual(
  diff([1, 2, 3], [1, 2]),
  [{ op: 'remove', path: '/2' }],
  'array remove last'
);
assertEqual(
  diff([], []),
  [],
  'empty arrays'
);

// ========== diff: arrays disabled ==========
console.log('diff: arrays disabled');
assertEqual(
  diff([1, 2], [1, 3], { arrays: false }),
  [{ op: 'replace', path: '', value: [1, 3] }],
  'replace whole array'
);

// ========== diff: type changes ==========
console.log('diff: type changes');
assertEqual(
  diff([1, 2], { 0: 1, 1: 2 }),
  [{ op: 'replace', path: '', value: { 0: 1, 1: 2 } }],
  'array to object'
);
assertEqual(
  diff({ a: 1 }, [1]),
  [{ op: 'replace', path: '', value: [1] }],
  'object to array'
);
assertEqual(
  diff(1, '1'),
  [{ op: 'replace', path: '', value: '1' }],
  'number to string'
);

// ========== diff: complex nested ==========
console.log('diff: complex nested');
assertEqual(
  diff(
    { users: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }] },
    { users: [{ name: 'Alice', age: 31 }, { name: 'Bob', age: 25 }] }
  ),
  [{ op: 'replace', path: '/users/0/age', value: 31 }],
  'nested array of objects'
);

// ========== diff: special characters in keys ==========
console.log('diff: special keys');
assertEqual(
  diff({ 'a/b': 1 }, { 'a/b': 2 }),
  [{ op: 'replace', path: '/a~1b', value: 2 }],
  'key with slash'
);
assertEqual(
  diff({ 'a~b': 1 }, { 'a~b': 2 }),
  [{ op: 'replace', path: '/a~0b', value: 2 }],
  'key with tilde'
);

// ========== applyPatch: basic ==========
console.log('applyPatch: basic');
assertEqual(applyPatch({ a: 1 }, [{ op: 'replace', path: '/a', value: 2 }]), { a: 2 }, 'apply replace');
assertEqual(applyPatch({ a: 1 }, [{ op: 'add', path: '/b', value: 2 }]), { a: 1, b: 2 }, 'apply add');
assertEqual(applyPatch({ a: 1, b: 2 }, [{ op: 'remove', path: '/b' }]), { a: 1 }, 'apply remove');
assertEqual(applyPatch([1, 2, 3], [{ op: 'add', path: '/-', value: 4 }]), [1, 2, 3, 4], 'apply array append');
assertEqual(applyPatch([1, 2, 3], [{ op: 'add', path: '/1', value: 9 }]), [1, 9, 2, 3], 'apply array insert');
assertEqual(applyPatch([1, 2, 3], [{ op: 'remove', path: '/1' }]), [1, 3], 'apply array remove');

// ========== applyPatch: move, copy, test ==========
console.log('applyPatch: move, copy, test');
assertEqual(
  applyPatch({ a: 1, b: 2 }, [{ op: 'move', from: '/a', path: '/c' }]),
  { b: 2, c: 1 },
  'apply move'
);
assertEqual(
  applyPatch({ a: 1 }, [{ op: 'copy', from: '/a', path: '/b' }]),
  { a: 1, b: 1 },
  'apply copy'
);
assertEqual(
  applyPatch({ a: 1 }, [{ op: 'test', path: '/a', value: 1 }]),
  { a: 1 },
  'apply test pass'
);
assertThrows(
  () => applyPatch({ a: 1 }, [{ op: 'test', path: '/a', value: 2 }]),
  'apply test fail throws'
);

// ========== applyPatch: immutability ==========
console.log('applyPatch: immutability');
const orig = { a: { b: 1 } };
const result = applyPatch(orig, [{ op: 'replace', path: '/a/b', value: 2 }]);
assertEqual(orig.a.b, 1, 'original not mutated');
assertEqual(result.a.b, 2, 'result has new value');

// ========== applyPatch: root replace ==========
console.log('applyPatch: root');
assertEqual(applyPatch(1, [{ op: 'replace', path: '', value: 2 }]), 2, 'root replace');
assertEqual(applyPatch(1, [{ op: 'add', path: '', value: { a: 1 } }]), { a: 1 }, 'root add');

// ========== roundtrip: diff then apply ==========
console.log('roundtrip: diff → apply');
{
  const cases = [
    [{ a: 1 }, { a: 2 }],
    [{}, { a: 1, b: 2, c: 3 }],
    [{ a: 1, b: 2 }, {}],
    [{ a: { b: { c: 1 } } }, { a: { b: { c: 2, d: 3 } } }],
    [[1, 2, 3], [1, 4, 3, 5]],
    [[], [1, 2]],
    [[1, 2], []],
    [null, 'hello'],
    [42, true],
    [{ users: [{ name: 'A' }] }, { users: [{ name: 'B' }, { name: 'C' }] }],
  ];
  for (const [src, tgt] of cases) {
    const patch = diff(src, tgt);
    const result = applyPatch(src, patch);
    assertEqual(result, tgt, `roundtrip ${JSON.stringify(src)} → ${JSON.stringify(tgt)}`);
  }
}

// ========== reversePatch ==========
console.log('reversePatch');
{
  const src = { a: 1, b: 2, c: 3 };
  const tgt = { a: 10, d: 4 };
  const patch = diff(src, tgt);
  const result = applyPatch(src, patch);
  assertEqual(result, tgt, 'forward patch works');

  const rev = reversePatch(src, patch);
  const restored = applyPatch(result, rev);
  assert(deepEqual(restored, src), 'reverse patch restores original');
}

// ========== reversePatch: array ops ==========
{
  const src = [1, 2, 3];
  const tgt = [1, 4, 3, 5];
  const patch = diff(src, tgt);
  const result = applyPatch(src, patch);
  assertEqual(result, tgt, 'forward array patch');

  const rev = reversePatch(src, patch);
  const restored = applyPatch(result, rev);
  assertEqual(restored, src, 'reverse array patch restores');
}

// ========== reversePatch: nested ==========
{
  const src = { a: { b: 1 }, c: [1, 2] };
  const tgt = { a: { b: 2, d: 3 }, c: [1] };
  const patch = diff(src, tgt);
  const result = applyPatch(src, patch);
  assertEqual(result, tgt, 'forward nested');

  const rev = reversePatch(src, patch);
  const restored = applyPatch(result, rev);
  assertEqual(restored, src, 'reverse nested restores');
}

// ========== Summary ==========
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
