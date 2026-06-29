# codec

`codec` is a small binary serialization library for TypeScript values.

Define a schema once, compile it with `createCodec(schema)`, then use the
resulting codec to encode and decode values. The schema is not interpreted on
every value: it is compiled into very optimized, specialized reader and writer
functions, so hot encode/decode paths avoid generic schema walking and stay
fast.

## Minimal Examples

### Object

```ts
import { createCodec, object } from "codec";

const userCodec = createCodec(
	object({
		id: "uint",
		name: "string",
		active: "boolean",
	}),
);

const encoded = userCodec.encode({
	id: 1,
	name: "Ada",
	active: true,
});

const decoded = userCodec.decode(encoded);
// { id: 1, name: "Ada", active: true }
```

### Type Inference

```ts
import { createCodec, type InferType, object } from "codec";

const schema = object({
	title: "string",
	version: "int",
});

type DocumentHeader = InferType<typeof schema>;

const value: DocumentHeader = {
	title: "Notes",
	version: -1,
};

const codec = createCodec(schema);
const decoded = codec.decode(codec.encode(value));
```

### Discriminated Union

Unions are one of the most useful features of this library. The discriminant is
encoded first, then only the fields for the matching variant are encoded.

```ts
import { createCodec, union } from "codec";

const eventCodec = createCodec(
	union("type", "string", {
		created: {
			id: "string",
			title: "string",
		},
		renamed: {
			id: "string",
			title: "string",
			previousTitle: "string",
		},
		deleted: {
			id: "string",
		},
	}),
);

const encoded = eventCodec.encode({
	type: "renamed",
	id: "note-1",
	title: "Project plan",
	previousTitle: "Draft",
});

const decoded = eventCodec.decode(encoded);
// decoded is typed as:
// | { type: "created"; id: string; title: string }
// | { type: "renamed"; id: string; title: string; previousTitle: string }
// | { type: "deleted"; id: string }
```

## Performance Model

`createCodec(schema)` compiles the schema into two optimized functions:

- a writer function that appends the binary representation to an `Encoder`
- a reader function that reconstructs the value from a `Decoder`

The generated functions inline the structure of the schema. For example, an
object schema becomes straight-line reads/writes for each field, arrays become
tight loops, and unions become a switch on the discriminant.

This means schema compilation has a small upfront cost, and repeated
serialization of values through the same codec is the intended fast path.

```ts
const codec = createCodec(schema); // compile once

for (const value of values) {
	send(codec.encode(value)); // reuse many times
}
```

`encode` reuses the codec's encoder buffer on repeated calls, then returns a
`Uint8Array` with an exact-sized backing `ArrayBuffer`.

```ts
const copied = codec.encode(value);
```

The returned bytes are safe to store, pass to APIs, or access through
`copied.buffer` without worrying about extra unused capacity.

## Schema Reference

### Primitives

Supported primitive schemas are:

- `"string"`: UTF-8 string with a variable-length byte length prefix
- `"int"`: signed safe integer, variable-length encoded
- `"uint"`: unsigned safe integer, variable-length encoded
- `"uint8Array"`: byte array with a variable-length byte length prefix
- `"boolean"`: one byte, `0` or `1`
- `"date"`: JavaScript `Date`, encoded as its millisecond timestamp; invalid dates are rejected
- `"float32"`: 32-bit floating-point number, fixed-width little-endian encoded
- `"float64"`: 64-bit floating-point number, fixed-width little-endian encoded

```ts
const stringCodec = createCodec("string");
stringCodec.decode(stringCodec.encode("hello"));

const intCodec = createCodec("int");
intCodec.decode(intCodec.encode(-42));

const uintCodec = createCodec("uint");
uintCodec.decode(uintCodec.encode(42));

const bytesCodec = createCodec("uint8Array");
bytesCodec.decode(bytesCodec.encode(new Uint8Array([1, 2, 3])));

const booleanCodec = createCodec("boolean");
booleanCodec.decode(booleanCodec.encode(true));

const dateCodec = createCodec("date");
dateCodec.decode(dateCodec.encode(new Date("2024-01-02T03:04:05.678Z")));

const float32Codec = createCodec("float32");
float32Codec.decode(float32Codec.encode(1 / 3));

const float64Codec = createCodec("float64");
float64Codec.decode(float64Codec.encode(Math.PI));
```

### BigInts

BigInts use `bigint(maxBytes = 128)`. The `maxBytes` cap is enforced while
encoding and decoding.

```ts
import { bigint, createCodec } from "codec";

const bigintCodec = createCodec(bigint());
bigintCodec.decode(bigintCodec.encode(2n ** 80n));

const compactBigintCodec = createCodec(bigint(8));
compactBigintCodec.decode(compactBigintCodec.encode(123456789n));
```

### Objects

Objects encode fields in the order they appear in the schema.

```ts
import { createCodec, object } from "codec";

const schema = object({
	name: "string",
	age: "int",
	score: "float64",
});

const codec = createCodec(schema);

codec.decode(
	codec.encode({
		name: "Alice",
		age: 30,
		score: 98.5,
	}),
);
```

Nested objects are supported.

```ts
const schema = object({
	user: object({
		name: "string",
		metadata: object({
			id: "uint",
		}),
	}),
});
```

### Arrays

Arrays encode their length first, then each element.

```ts
import { array, createCodec, object } from "codec";

const tagsCodec = createCodec(array("string"));
tagsCodec.decode(tagsCodec.encode(["work", "draft"]));

const usersCodec = createCodec(
	array(
		object({
			id: "uint",
			name: "string",
		}),
	),
);

usersCodec.decode(
	usersCodec.encode([
		{ id: 1, name: "Alice" },
		{ id: 2, name: "Bob" },
	]),
);
```

### Sets

Sets encode their size first, then each element in insertion order.

```ts
import { createCodec, set } from "codec";

const tagSetCodec = createCodec(set("string"));
const decoded = tagSetCodec.decode(
	tagSetCodec.encode(new Set(["work", "draft"])),
);
// Set { "work", "draft" }
```

### Maps

Maps encode plain string-keyed objects. The key is always encoded as a string;
the value schema is provided to `map(...)`.

```ts
import { createCodec, map, object } from "codec";

const scoresCodec = createCodec(map("int"));
scoresCodec.decode(
	scoresCodec.encode({
		alice: 10,
		bob: -2,
	}),
);

const usersByIdCodec = createCodec(
	map(
		object({
			name: "string",
			age: "int",
		}),
	),
);

usersByIdCodec.decode(
	usersByIdCodec.encode({
		"1": { name: "Alice", age: 30 },
		"2": { name: "Bob", age: 25 },
	}),
);
```

### Tuples

Tuples encode a fixed number of values with a different schema for each
position.

```ts
import { createCodec, object, tuple } from "codec";

const pointCodec = createCodec(tuple("int", "int", "int"));
pointCodec.decode(pointCodec.encode([10, 20, 30]));

const mixedCodec = createCodec(
	tuple("string", "int", object({ label: "string" })),
);
mixedCodec.decode(mixedCodec.encode(["item", 42, { label: "important" }]));
```

### Optional Values

`optional(schema)` encodes a presence byte. Only `undefined` is treated as
missing.

```ts
import { createCodec, object, optional } from "codec";

const codec = createCodec(
	object({
		title: "string",
		description: optional("string"),
	}),
);

codec.decode(
	codec.encode({
		title: "Untitled",
		description: undefined,
	}),
);

codec.decode(
	codec.encode({
		title: "Release notes",
		description: "Draft",
	}),
);
```

### Unions

`union(discriminant, type, variants)` creates a discriminated union.

The discriminant can be encoded as `"string"`, `"int"`, or `"uint"`. Variant
keys are matched against that encoded discriminant value.

```ts
import { array, createCodec, union } from "codec";

const messageCodec = createCodec(
	union("kind", "string", {
		text: {
			body: "string",
		},
		files: {
			names: array("string"),
		},
	}),
);

messageCodec.decode(
	messageCodec.encode({
		kind: "files",
		names: ["brief.pdf", "notes.md"],
	}),
);
```

Numeric discriminants are useful for compact wire formats.

```ts
const compactMessageCodec = createCodec(
	union("type", "uint", {
		0: {
			x: "string",
			y: "int",
		},
		1: {
			values: array("string"),
		},
	}),
);

compactMessageCodec.decode(
	compactMessageCodec.encode({
		type: 0,
		x: "hello",
		y: 42,
	}),
);
```

The discriminant field itself is automatically reconstructed during decoding.
It should not be repeated inside the variant field definitions.

```ts
const schema = union("status", "string", {
	loading: {},
	ready: {
		value: "string",
	},
	failed: {
		reason: "string",
	},
});
```

Recursive schemas can be expressed with lazy schema functions.

```ts
import { createCodec, type UnionSchema, union } from "codec";

type NodeSchema = UnionSchema<
	"type",
	{
		number: { value: "int" };
		child: { child: () => NodeSchema };
	}
>;

const schema: NodeSchema = union("type", "string", {
	number: { value: "int" },
	child: { child: () => schema },
});

const codec = createCodec(schema);

codec.decode(
	codec.encode({
		type: "child",
		child: {
			type: "number",
			value: 42,
		},
	}),
);
```

## API Reference

### `createCodec(schema)`

Compiles a schema and returns a `Codec<T>`.

```ts
interface Codec<T> {
	encode(value: T): Uint8Array<ArrayBuffer>;
	decode(buffer: Uint8Array | Decoder): T;
}
```

- `encode(value)` returns an exact-sized `Uint8Array` copy.
- `decode(buffer)` accepts a `Uint8Array` or an existing `Decoder`.

### Schema Builders

```ts
array(element);
object(fields);
map(element);
tuple(...elements);
optional(schema);
union(discriminant, type, variants);
```

Use `InferType<typeof schema>` to derive the TypeScript value type from a
schema.

```ts
import { type InferType, object } from "codec";

const schema = object({
	id: "string",
	version: "int",
});

type Value = InferType<typeof schema>;
```

### Binary Helpers

The package also exports lower-level helpers for manual binary formats:

```ts
import {
	createDecoder,
	createEncoder,
	readVarInt,
	readVarString,
	readVarUint,
	readVarUint8Array,
	toUint8Array,
	writeVarInt,
	writeVarString,
	writeVarUint,
	writeVarUint8Array,
} from "codec";

const encoder = createEncoder();

writeVarUint(encoder, 123);
writeVarInt(encoder, -42);
writeVarString(encoder, "hello");
writeVarUint8Array(encoder, new Uint8Array([1, 2, 3]));

const bytes = toUint8Array(encoder);
const decoder = createDecoder(bytes);

readVarUint(decoder);
readVarInt(decoder);
readVarString(decoder);
readVarUint8Array(decoder);
```

## Benchmarks

Codec is built to be fast. A series of optimizations make it the current fastest serializer and deserializer, even faster than JSON for all cases tested.

Results for encoding and decoding speed for a medium JSON object:

| Serializer                | Bytes | Encode us | Decode us | Round trip us |
| ------------------------- | ----: | --------: | --------: | ------------: |
| `codec`                   |   803 |      0.83 |      1.12 |          1.95 |
| `json`                    |  1082 |      0.83 |      1.36 |          2.16 |
| `avsc`                    |   806 |      1.09 |      3.17 |          4.37 |
| `msgpackr`                |   949 |      1.26 |      3.39 |          4.65 |
| `v8`                      |  1266 |      2.49 |      2.47 |          5.00 |
| `@msgpack/msgpack`        |   943 |      1.88 |      3.51 |          5.36 |
| `cbor-x`                  |   957 |      1.26 |      4.37 |          5.63 |
| `msgpackr-records`        |   955 |      1.74 |      4.13 |          5.84 |
| `bson`                    |  1127 |      2.99 |      7.36 |         10.47 |
| `bunker-schema`           |   978 |      5.85 |      9.02 |         14.92 |
| `protobufjs`              |  1369 |      7.05 |      8.15 |         15.08 |
| `bunker`                  |   978 |      6.93 |      8.74 |         15.49 |
| `flatbuffers-flexbuffers` |  1134 |     21.30 |      9.66 |         30.35 |
| `@bufbuild/protobuf`      |  1369 |     32.66 |     32.75 |         65.71 |

The fast path comes from a few deliberate implementation choices:

- schemas compile into specialized reader/writer functions, so hot paths do not walk a schema tree;
- object readers construct stable object shapes directly instead of assigning fields through a generic interpreter;
- fixed-width booleans and floats are inlined in generated code, with cached `DataView` instances for binary number access;
- small ASCII strings avoid `TextEncoder`/`TextDecoder` overhead, while non-ASCII strings fall back to UTF-8 handling;
- repeated map keys are cached by byte pattern during decode, which helps payloads with stable string-keyed maps;
- repeated `encode` calls reuse the codec's encoder buffer before returning the exact-sized copy.

Run with:

```sh
bun run benchmark # run the benchmarks and show the results
bun run benchmark:save # run the benchmarks and save the results in a file
bun benchmarks.html # show the last saved results in an html table
```

The default output is a JSON report and the same report is saved to
`benchmarks/results.json`.

### CLI

```sh
bun run benchmark [--table] [--serializers <names>]
```

Options:

- `--table`: print a `console.table` summary instead of JSON.
- `--serializer <name>`: run one serializer. Can be repeated.
- `--serializers <names>`: run a comma-separated list of serializers.

The `--serializer=<name>` and `--serializers=<names>` forms are also supported.

Examples:

```sh
bun run benchmark --table
bun run benchmark --serializers codec,json,msgpackr
bun run benchmark --serializer codec --serializer avsc --table
```

Available serializers:

- `codec`
- `json`
- `bunker`
- `bunker-schema`
- `msgpackr`
- `msgpackr-records`
- `@msgpack/msgpack`
- `cbor-x`
- `avsc`
- `protobufjs`
- `@bufbuild/protobuf`
- `v8`
- `flatbuffers-flexbuffers`
- `bson`

View saved results from the repository root:

```sh
bun benchmarks.html
```
