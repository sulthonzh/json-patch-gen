# json-patch-gen

Generate [RFC 6902](https://tools.ietf.org/html/rfc6902) JSON Patch operations by comparing two JSON values. Zero dependencies.

## Why?

You've got two versions of a JSON document and you need to know what changed. Maybe you're building a sync engine, an undo system, a collaborative editor, or auditing config changes. JSON Patch is the standard way to describe those changes — this library generates them automatically.

```js
const { diff, applyPatch } = require('json-patch-gen');

const patch = diff({ name: 'Alice', age: 30 }, { name: 'Alice', age: 31 });
// → [{ op: 'replace', path: '/age', value: 31 }]

const updated = applyPatch({ name: 'Alice', age: 30 }, patch);
// → { name: 'Alice', age: 31 }
```

## Install

```bash
npm install json-patch-gen
```

## API

### `diff(source, target, options?)`

Generate patch operations to transform `source` into `target`.

```js
const patch = diff(
  { users: [{ name: 'Alice' }] },
  { users: [{ name: 'Alice' }, { name: 'Bob' }] }
);
// → [{ op: 'add', path: '/users/1', value: { name: 'Bob' } }]
```

**Options:**
- `arrays` (default: `true`) — Diff arrays element-by-element. Set to `false` to replace entire arrays.

### `applyPatch(doc, patch)`

Apply a JSON Patch to a document. Returns a new value (immutable — original is not modified).

```js
const result = applyPatch({ a: 1 }, [
  { op: 'add', path: '/b', value: 2 },
  { op: 'replace', path: '/a', value: 10 }
]);
// → { a: 10, b: 2 }
```

Supports all RFC 6902 operations: `add`, `remove`, `replace`, `move`, `copy`, `test`.

### `reversePatch(source, patch)`

Generate a patch that undoes the given patch. Useful for undo/redo.

```js
const original = { a: 1, b: 2 };
const patch = diff(original, { a: 1 });
// → [{ op: 'remove', path: '/b' }]

const reverse = reversePatch(original, patch);
// → [{ op: 'add', path: '/b', value: 2 }]
```

### Utilities

- `escapeSegment(s)` — Escape a string for use in a JSON Pointer segment
- `buildPath(segments)` — Build a JSON Pointer from segments array
- `parsePointer(pointer)` — Parse a JSON Pointer into unescaped segments
- `deepEqual(a, b)` — Deep equality check

## CLI

```bash
# Compare two JSON files
json-patch-gen diff old.json new.json

# Apply a patch
json-patch-gen apply doc.json patch.json

# Generate reverse patch (for undo)
json-patch-gen reverse original.json patch.json

# Validate a patch
json-patch-gen validate patch.json

# Pipe JSON from stdin
echo '{"a":1}' | json-patch-gen diff - '{"a":2}'
```

**Options:** `--pretty` (default), `--compact`, `--no-arrays`, `-h`

## How It Works

The diff engine walks both values simultaneously:

- **Same value** → no-op
- **Type changed or primitives** → `replace`
- **Object** → compare keys: added keys → `add`, removed keys → `remove`, changed values → recurse
- **Array** → compare elements by index: new elements → `add`, removed → `remove` (from end), changed → recurse

Path escaping follows RFC 6901 (`~` → `~0`, `/` → `~1`).

## Real-World Use Cases

**Config change auditing:**
```js
const oldConfig = JSON.parse(fs.readFileSync('config.v1.json'));
const newConfig = JSON.parse(fs.readFileSync('config.v2.json'));
const changes = diff(oldConfig, newConfig);
// Store changes in your audit log
```

**Undo system:**
```js
const patch = diff(state, newState);
const undo = reversePatch(state, patch);
redoStack.push(patch);
undoStack.push(undo);
```

**Collaborative sync:**
```js
// Client sends only what changed
const patch = diff(lastSynced, current);
send('/sync', { patch });
```

## License

MIT
