import { describe, expect, test } from "bun:test";
import {
	array,
	bigint,
	createCodec,
	createDecoder,
	createEncoder,
	type InferType,
	map,
	object,
	optional,
	readFloat32,
	readFloat64,
	readVarBigInt,
	readVarInt,
	readVarUint,
	type Schema,
	set,
	toUint8Array,
	tuple,
	type UnionSchema,
	union,
	writeFloat32,
	writeFloat64,
	writeVarBigInt,
	writeVarInt,
	writeVarUint,
} from "./index";

type Assignable<Actual, Expected> =
	(<Type>() => Type extends Actual ? 1 : 2) extends <Type>() => Type extends Expected ? 1 : 2
		? true
		: false;
type Equal<Actual, Expected> =
	Assignable<Actual, Expected> extends true ? Assignable<Expected, Actual> : false;
type Expect<Type extends true> = Type;
type ExactOptionalPropertyTypesEnabled = { field?: undefined } extends { field?: never }
	? false
	: true;
type EmptyObject = Record<never, never>;
type IsOptionalKey<Type, Key extends keyof Type> =
	EmptyObject extends Pick<Type, Key> ? true : false;

interface WireFormatFixture {
	name: string;
	schema: Schema;
	value: any;
	expectedBytes: number[];
	assertDecoded?: (decoded: any) => void;
}

type WireRecursiveSchema = UnionSchema<
	"string",
	{
		number: { number: "int" };
		child: { child: () => WireRecursiveSchema };
	}
>;

const wireRecursiveSchema: WireRecursiveSchema = union("string", {
	number: { number: "int" },
	child: { child: (): WireRecursiveSchema => wireRecursiveSchema },
});

// Golden wire-format fixtures: update these only for intentional breaking format changes.
const wireFormatFixtures: WireFormatFixture[] = [
	{
		name: "primitive string ascii",
		schema: "string",
		value: "hello",
		expectedBytes: [5, 104, 101, 108, 108, 111],
	},
	{
		name: "primitive string utf8",
		schema: "string",
		value: "hello café 🚀",
		expectedBytes: [16, 104, 101, 108, 108, 111, 32, 99, 97, 102, 195, 169, 32, 240, 159, 154, 128],
	},
	{
		name: "primitive int negative",
		schema: "int",
		value: -42,
		expectedBytes: [106],
	},
	{
		name: "primitive int negative zero",
		schema: "int",
		value: -0,
		expectedBytes: [64],
		assertDecoded: (decoded) => {
			expect(Object.is(decoded, -0)).toBe(true);
		},
	},
	{
		name: "primitive uint multibyte",
		schema: "uint",
		value: 300,
		expectedBytes: [172, 2],
	},
	{
		name: "primitive uint8Array",
		schema: "uint8Array",
		value: new Uint8Array([0, 1, 127, 128, 255]),
		expectedBytes: [5, 0, 1, 127, 128, 255],
	},
	{
		name: "primitive boolean true",
		schema: "boolean",
		value: true,
		expectedBytes: [1],
	},
	{
		name: "primitive boolean false",
		schema: "boolean",
		value: false,
		expectedBytes: [0],
	},
	{
		name: "primitive date",
		schema: "date",
		value: new Date("2024-01-02T03:04:05.678Z"),
		expectedBytes: [0, 224, 178, 13, 130, 204, 120, 66],
	},
	{
		name: "primitive float32",
		schema: "float32",
		value: 1.5,
		expectedBytes: [0, 0, 192, 63],
	},
	{
		name: "primitive float64",
		schema: "float64",
		value: -2.25,
		expectedBytes: [0, 0, 0, 0, 0, 0, 2, 192],
	},
	{
		name: "bigint schema",
		schema: bigint(),
		value: -(2n ** 70n + 5n),
		expectedBytes: [197, 128, 128, 128, 128, 128, 128, 128, 128, 128, 2],
	},
	{
		name: "composed array",
		schema: array("int"),
		value: [-1, 0, 1, 64],
		expectedBytes: [4, 65, 0, 1, 128, 1],
	},
	{
		name: "composed object",
		schema: object({
			id: "uint",
			label: "string",
			active: "boolean",
		}),
		value: { id: 7, label: "ok", active: true },
		expectedBytes: [7, 2, 111, 107, 1],
	},
	{
		name: "composed optional present",
		schema: optional("string"),
		value: "yes",
		expectedBytes: [1, 3, 121, 101, 115],
	},
	{
		name: "composed optional absent",
		schema: optional("string"),
		value: undefined,
		expectedBytes: [0],
	},
	{
		name: "composed union string discriminant",
		schema: union("string", {
			user: { name: "string", age: "int" },
			product: { title: "string", price: "uint" },
		}),
		value: { type: "user", name: "Ada", age: 37 },
		expectedBytes: [4, 117, 115, 101, 114, 3, 65, 100, 97, 37],
	},
	{
		name: "composed union custom tag name",
		schema: union({
			tagName: "kind",
			tagType: "string",
			variants: {
				user: { name: "string", age: "int" },
				product: { title: "string", price: "uint" },
			},
		}),
		value: { kind: "user", name: "Ada", age: 37 },
		expectedBytes: [4, 117, 115, 101, 114, 3, 65, 100, 97, 37],
	},
	{
		name: "composed union uint discriminant",
		schema: union("uint", {
			0: { x: "string" },
			1: { y: "uint" },
		}),
		value: { type: 1, y: 300 },
		expectedBytes: [1, 172, 2],
	},
	{
		name: "composed union int discriminant",
		schema: union("int", {
			"-1": { error: "string" },
			2: { ok: "boolean" },
		}),
		value: { type: -1, error: "no" },
		expectedBytes: [65, 2, 110, 111],
	},
	{
		name: "composed untagged union",
		schema: union([
			object({ name: "string", age: "int" }),
			object({ title: "string", price: "uint" }),
		]),
		value: { title: "Widget", price: 300 },
		expectedBytes: [1, 6, 87, 105, 100, 103, 101, 116, 172, 2],
	},
	{
		name: "composed map",
		schema: map("uint"),
		value: { alpha: 1, beta: 300 },
		expectedBytes: [2, 5, 97, 108, 112, 104, 97, 1, 4, 98, 101, 116, 97, 172, 2],
	},
	{
		name: "composed set",
		schema: set("string"),
		value: new Set(["a", "bc"]),
		expectedBytes: [2, 1, 97, 2, 98, 99],
	},
	{
		name: "composed tuple",
		schema: tuple("string", "int", "boolean"),
		value: ["x", -2, false],
		expectedBytes: [1, 120, 66, 0],
	},
	{
		name: "lazy schema",
		schema: () =>
			object({
				name: "string",
				count: "uint",
			}),
		value: { name: "lazy", count: 2 },
		expectedBytes: [4, 108, 97, 122, 121, 2],
	},
	{
		name: "recursive lazy schema",
		schema: wireRecursiveSchema,
		value: { type: "child", child: { type: "number", number: 42 } },
		expectedBytes: [5, 99, 104, 105, 108, 100, 6, 110, 117, 109, 98, 101, 114, 42],
	},
	{
		name: "nested composed schema",
		schema: object({
			tags: array("string"),
			counts: map("uint"),
			flags: set("boolean"),
			range: tuple("int", "int"),
			maybe: optional("date"),
		}),
		value: {
			tags: ["a", "é"],
			counts: { one: 1, big: 300 },
			flags: new Set([true, false]),
			range: [-5, 5],
			maybe: new Date("2024-01-01T00:00:00.000Z"),
		},
		expectedBytes: [
			2, 1, 97, 2, 195, 169, 2, 3, 111, 110, 101, 1, 3, 98, 105, 103, 172, 2, 2, 1, 0, 69, 5, 1, 0,
			0, 64, 31, 37, 204, 120, 66,
		],
	},
];

function normalizeWireFixtureValue(value: any): any {
	if (value instanceof Uint8Array) {
		return Array.from(value);
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (value instanceof Set) {
		return Array.from(value, normalizeWireFixtureValue);
	}

	if (Array.isArray(value)) {
		return value.map(normalizeWireFixtureValue);
	}

	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, normalizeWireFixtureValue(entry)]),
		);
	}

	return value;
}

function expectWireFixtureDecodedValue(fixture: WireFormatFixture, decoded: any): void {
	if (fixture.assertDecoded) {
		fixture.assertDecoded(decoded);
		return;
	}

	expect(normalizeWireFixtureValue(decoded)).toEqual(normalizeWireFixtureValue(fixture.value));
}

describe("signature codec", () => {
	test("primitive types", () => {
		const stringCodec = createCodec("string");
		const encoded = stringCodec.encode("hello");
		const decoded = stringCodec.decode(encoded);
		expect(decoded).toBe("hello");

		const intCodec = createCodec("int");
		const encodedInt = intCodec.encode(-42);
		const decodedInt = intCodec.decode(encodedInt);
		expect(decodedInt).toBe(-42);

		const uintCodec = createCodec("uint");
		const encodedUint = uintCodec.encode(42);
		const decodedUint = uintCodec.decode(encodedUint);
		expect(decodedUint).toBe(42);

		const bytesCodec = createCodec("uint8Array");
		const bytes = new Uint8Array([1, 2, 3, 4]);
		const encodedBytes = bytesCodec.encode(bytes);
		const decodedBytes = bytesCodec.decode(encodedBytes);
		expect(decodedBytes).toEqual(bytes);
	});

	test("float primitive types", () => {
		const float32Codec = createCodec("float32");
		const encodedFloat32 = float32Codec.encode(1 / 3);
		const decodedFloat32 = float32Codec.decode(encodedFloat32);
		expect(encodedFloat32.byteLength).toBe(4);
		expect(decodedFloat32).toBe(Math.fround(1 / 3));

		const float64Codec = createCodec("float64");
		const encodedFloat64 = float64Codec.encode(Math.PI);
		const decodedFloat64 = float64Codec.decode(encodedFloat64);
		expect(encodedFloat64.byteLength).toBe(8);
		expect(decodedFloat64).toBe(Math.PI);

		expect(Object.is(float32Codec.decode(float32Codec.encode(-0)), -0)).toBe(true);
		expect(float64Codec.decode(float64Codec.encode(Infinity))).toBe(Infinity);
		expect(Number.isNaN(float64Codec.decode(float64Codec.encode(NaN)))).toBe(true);
	});

	test("date primitive type", () => {
		const codec = createCodec("date");
		const value = new Date("2024-01-02T03:04:05.678Z");
		const decoded = codec.decode(codec.encode(value));

		expect(decoded).toBeInstanceOf(Date);
		expect(decoded.getTime()).toBe(value.getTime());

		expect(() => codec.encode(new Date(Number.NaN))).toThrow("Cannot encode invalid Date");

		const encoder = createEncoder();
		writeFloat64(encoder, Number.NaN);
		expect(() => codec.decode(toUint8Array(encoder))).toThrow("Cannot decode invalid Date");
	});

	test("bigint schema", () => {
		const codec = createCodec(bigint());
		const values = [0n, 1n, -1n, 63n, 64n, -64n, 2n ** 80n, -(2n ** 80n)];

		for (const value of values) {
			expect(codec.decode(codec.encode(value))).toBe(value);
		}
	});

	test("bigint schema maxBytes", () => {
		const oneByteCodec = createCodec(bigint(1));
		const twoByteCodec = createCodec(bigint(2));

		expect(oneByteCodec.decode(oneByteCodec.encode(63n))).toBe(63n);
		expect(() => oneByteCodec.encode(64n)).toThrow("BigInt exceeds maxBytes (1)");
		expect(() => oneByteCodec.decode(twoByteCodec.encode(64n))).toThrow(
			"BigInt exceeds maxBytes (1)",
		);
		expect(() => bigint(0)).toThrow("bigint maxBytes must be a positive safe integer");
	});

	test("encode returns an exact copy", () => {
		const codec = createCodec("string");
		const value = "a".repeat(200);

		const encoded = codec.encode(value);
		expect(encoded.buffer.byteLength).toBe(encoded.byteLength);
		expect(codec.decode(encoded)).toBe(value);
		const overwritten = codec.encode("b".repeat(240));
		expect(codec.decode(encoded)).toBe(value);
		expect(codec.decode(overwritten)).toBe("b".repeat(240));
	});

	test("string primitive supports non-ASCII values", () => {
		const codec = createCodec("string");
		const value = "hello café 🚀";

		expect(codec.decode(codec.encode(value))).toBe(value);
	});

	test("varuint boundary values", () => {
		const values = [0, 1, 127, 128, 255, 16_384, 0xffff_ffff, Number.MAX_SAFE_INTEGER];
		const encoder = createEncoder();

		for (const value of values) {
			writeVarUint(encoder, value);
		}

		const encoded = toUint8Array(encoder);
		expect(encoded.slice(0, 12)).toEqual(
			new Uint8Array([0, 1, 127, 128, 1, 255, 1, 128, 128, 1, 255, 255]),
		);

		const decoder = createDecoder(encoded);
		for (const value of values) {
			expect(readVarUint(decoder)).toBe(value);
		}
	});

	test("varbigint boundary values", () => {
		const values = [
			0n,
			1n,
			-1n,
			63n,
			64n,
			-64n,
			BigInt(Number.MAX_SAFE_INTEGER),
			2n ** 128n,
			-(2n ** 128n),
		];
		const encoder = createEncoder();

		for (const value of values) {
			writeVarBigInt(encoder, value);
		}

		const decoder = createDecoder(toUint8Array(encoder));
		for (const value of values) {
			expect(readVarBigInt(decoder)).toBe(value);
		}
	});

	test("varint boundary values", () => {
		const values = [
			-0,
			0,
			1,
			-1,
			63,
			64,
			-64,
			0xffff_ffff,
			-0xffff_ffff,
			Number.MAX_SAFE_INTEGER,
			-Number.MAX_SAFE_INTEGER,
		];
		const encoder = createEncoder();

		for (const value of values) {
			writeVarInt(encoder, value);
		}

		const decoder = createDecoder(toUint8Array(encoder));
		expect(Object.is(readVarInt(decoder), -0)).toBe(true);
		for (let index = 1; index < values.length; index++) {
			expect(readVarInt(decoder)).toBe(values[index]!);
		}
	});

	test("float binary helpers use fixed-width little-endian values", () => {
		const encoder = createEncoder();
		writeFloat32(encoder, 1.5);
		writeFloat64(encoder, -2.25);

		const encoded = toUint8Array(encoder);
		expect(encoded).toEqual(new Uint8Array([0, 0, 192, 63, 0, 0, 0, 0, 0, 0, 2, 192]));

		const decoder = createDecoder(encoded);
		expect(readFloat32(decoder)).toBe(1.5);
		expect(readFloat64(decoder)).toBe(-2.25);
	});

	describe("wire format fixtures", () => {
		for (const fixture of wireFormatFixtures) {
			test(fixture.name, () => {
				const codec = createCodec(fixture.schema);
				const expectedBytes = new Uint8Array(fixture.expectedBytes);

				expect((codec.encode as (value: any) => Uint8Array<ArrayBuffer>)(fixture.value)).toEqual(
					expectedBytes,
				);
				expectWireFixtureDecodedValue(fixture, codec.decode(expectedBytes));
				expectWireFixtureDecodedValue(fixture, codec.decode(createDecoder(expectedBytes)));
			});
		}
	});

	test("object type", () => {
		const schema = object({
			name: "string",
			age: "int",
		});

		const codec = createCodec(schema);

		const value = { name: "Alice", age: 30 };
		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);

		// Type inference check
		type Person = InferType<typeof schema>;
		const person: Person = { name: "Bob", age: 25 };
		person.name = "Robert";
		expect(person.name).toBe("Robert");
	});

	test("nested object", () => {
		const schema = object({
			user: object({
				name: "string",
				metadata: object({
					id: "uint",
				}),
			}),
		});

		const codec = createCodec(schema);

		const value = {
			user: {
				name: "Charlie",
				metadata: { id: 123 },
			},
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("float types inside objects and tuples", () => {
		const schema = object({
			position: tuple("float32", "float32"),
			weight: "float64",
		});

		const codec = createCodec(schema);

		const value = {
			position: [12.5, -0.25] as [number, number],
			weight: Math.PI,
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);

		type Measurement = InferType<typeof schema>;
		const measurement: Measurement = { position: [1, 2], weight: 3.5 };
		expect(measurement.weight).toBe(3.5);
	});

	test("array type", () => {
		const schema = array("string");
		const codec = createCodec(schema);

		const value = ["hello", "world", "test"];
		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("array of objects", () => {
		const schema = array(
			object({
				id: "uint",
				name: "string",
			}),
		);

		const codec = createCodec(schema);

		const value = [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		];

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("set type", () => {
		const schema = set("string");
		const codec = createCodec(schema);

		const value = new Set(["hello", "world", "test"]);
		const decoded = codec.decode(codec.encode(value));

		expect(decoded).toBeInstanceOf(Set);
		expect([...decoded]).toEqual([...value]);

		type StringSet = InferType<typeof schema>;
		const typedSet: StringSet = new Set(["typed"]);
		expect(typedSet.has("typed")).toBe(true);
	});

	test("set with objects and new primitives", () => {
		const schema = object({
			createdAt: "date",
			versions: set(
				object({
					id: bigint(),
					label: "string",
					releasedAt: "date",
				}),
			),
		});
		const codec = createCodec(schema);

		const value = {
			createdAt: new Date("2025-05-06T07:08:09.010Z"),
			versions: new Set([
				{
					id: 9007199254740993n,
					label: "first",
					releasedAt: new Date("2025-05-07T00:00:00.000Z"),
				},
				{
					id: -9007199254740994n,
					label: "second",
					releasedAt: new Date("2025-05-08T00:00:00.000Z"),
				},
			]),
		};

		const decoded = codec.decode(codec.encode(value));

		expect(decoded.createdAt.getTime()).toBe(value.createdAt.getTime());
		expect([...decoded.versions]).toEqual([...value.versions]);
	});

	test("map with primitive values", () => {
		const schema = map("string");
		const codec = createCodec(schema);

		const value = {
			key1: "hello",
			key2: "world",
			anotherKey: "test",
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);

		// Type inference check
		type StringMap = InferType<typeof schema>;
		const typedMap: StringMap = { foo: "bar" };
		expect(typedMap.foo).toBe("bar");
	});

	test("map with int values", () => {
		const schema = map("int");
		const codec = createCodec(schema);

		const value = {
			score: 100,
			negative: -50,
			zero: 0,
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("map decode handles changed key shapes with the same codec", () => {
		const codec = createCodec(map("uint"));

		const first = { aa: 1, bb: 2 };
		const second = { cc: 3, dd: 4 };

		expect(codec.decode(codec.encode(first))).toEqual(first);
		expect(codec.decode(codec.encode(second))).toEqual(second);
		expect(codec.decode(codec.encode(first))).toEqual(first);
	});

	test("map with object values", () => {
		const schema = map(
			object({
				name: "string",
				age: "int",
			}),
		);

		const codec = createCodec(schema);

		const value = {
			alice: { name: "Alice", age: 30 },
			bob: { name: "Bob", age: 25 },
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("map with array values", () => {
		const schema = map(array("string"));
		const codec = createCodec(schema);

		const value = {
			tags: ["important", "draft"],
			categories: ["work", "personal", "archive"],
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("empty map", () => {
		const schema = map("uint");
		const codec = createCodec(schema);

		const value = {};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("map inside object", () => {
		const schema = object({
			id: "string",
			scores: map("uint"),
			metadata: map("string"),
		});

		const codec = createCodec(schema);

		const value = {
			id: "user-123",
			scores: { math: 95, science: 88, history: 92 },
			metadata: { role: "admin", status: "active" },
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("nested maps", () => {
		const schema = map(map("int"));
		const codec = createCodec(schema);

		const value = {
			user1: { score: 100, level: 5 },
			user2: { score: 250, level: 10 },
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("optional map", () => {
		const schema = object({
			name: "string",
			attributes: optional(map("string")),
		});

		const codec = createCodec(schema);

		const withMap = { name: "test", attributes: { color: "red", size: "large" } };
		const encodedWith = codec.encode(withMap);
		const decodedWith = codec.decode(encodedWith);
		expect(decodedWith).toEqual(withMap);

		const withoutMap = { name: "test", attributes: undefined };
		const encodedWithout = codec.encode(withoutMap);
		const decodedWithout = codec.decode(encodedWithout);
		expect(decodedWithout).toEqual(withoutMap);
	});

	test("tuple with primitives", () => {
		const schema = tuple("string", "int", "uint");
		const codec = createCodec(schema);

		const value: [string, number, number] = ["hello", -42, 100];
		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);

		// Type inference check
		type MyTuple = InferType<typeof schema>;
		const typedTuple: MyTuple = ["test", 1, 2];
		expect(typedTuple[0]).toBe("test");
		expect(typedTuple[1]).toBe(1);
		expect(typedTuple[2]).toBe(2);
	});

	test("tuple with mixed types", () => {
		const schema = tuple("string", "int", object({ x: "string", y: "uint" }));

		const codec = createCodec(schema);

		const value: [string, number, { x: string; y: number }] = ["hello", 42, { x: "world", y: 100 }];

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("tuple with arrays", () => {
		const schema = tuple("string", array("int"), "boolean");
		const codec = createCodec(schema);

		const value: [string, number[], boolean] = ["test", [1, 2, 3, -4], true];

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("tuple inside object", () => {
		const schema = object({
			id: "string",
			coordinates: tuple("int", "int", "int"),
			metadata: tuple("string", "uint"),
		});

		const codec = createCodec(schema);

		const value = {
			id: "point-1",
			coordinates: [10, 20, 30] as [number, number, number],
			metadata: ["created", 1234] as [string, number],
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("array of tuples", () => {
		const schema = array(tuple("string", "int"));
		const codec = createCodec(schema);

		const value: [string, number][] = [
			["alice", 30],
			["bob", 25],
			["charlie", 35],
		];

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("nested tuples", () => {
		const schema = tuple("string", tuple("int", "int"), "boolean");
		const codec = createCodec(schema);

		const value: [string, [number, number], boolean] = ["point", [10, 20], true];

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("optional tuple", () => {
		const schema = object({
			name: "string",
			range: optional(tuple("int", "int")),
		});

		const codec = createCodec(schema);

		const withTuple = { name: "test", range: [-10, 10] as [number, number] };
		const encodedWith = codec.encode(withTuple);
		const decodedWith = codec.decode(encodedWith);
		expect(decodedWith).toEqual(withTuple);

		const withoutTuple = { name: "test", range: undefined };
		const encodedWithout = codec.encode(withoutTuple);
		const decodedWithout = codec.decode(encodedWithout);
		expect(decodedWithout).toEqual(withoutTuple);
	});

	test("single element tuple", () => {
		const schema = tuple("string");
		const codec = createCodec(schema);

		const value: [string] = ["only one"];
		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded).toEqual(value);
	});

	test("optional fields", () => {
		const schema = object({
			required: "string",
			optional: optional("int"),
		});

		const codec = createCodec(schema);
		type Value = InferType<typeof schema>;
		type _OptionalFieldsShape = Expect<
			Equal<Value, { required: string; optional?: number | undefined }>
		>;
		type _OptionalFieldIsOptional = Expect<Equal<IsOptionalKey<Value, "optional">, true>>;
		type _OptionalFieldKeepsUndefined = ExactOptionalPropertyTypesEnabled extends true
			? Expect<Equal<Required<Pick<Value, "optional">>["optional"], number | undefined>>
			: true;
		const lazyOptionalSchema = object({
			required: "string",
			optional: () => optional("int"),
		});
		type LazyValue = InferType<typeof lazyOptionalSchema>;
		type _LazyOptionalFieldsShape = Expect<
			Equal<LazyValue, { required: string; optional?: number | undefined }>
		>;

		const withOptional: Value = { required: "test", optional: 42 };
		const encodedWith = codec.encode(withOptional);
		const decodedWith = codec.decode(encodedWith);
		expect(decodedWith).toEqual(withOptional);

		const withoutOptional: Value = { required: "test" };
		const encodedWithout = codec.encode(withoutOptional);
		const decodedWithout = codec.decode(encodedWithout);
		expect(decodedWithout).toEqual({ required: "test", optional: undefined });

		const explicitUndefined: Value = { required: "test", optional: undefined };
		expect(codec.decode(codec.encode(explicitUndefined))).toEqual(explicitUndefined);
	});

	test("union with int discriminant", () => {
		const schema = union("uint", {
			0: { x: "string", y: "int" },
			1: { z: array("string") },
		});

		const codec = createCodec(schema);

		const variant0 = { type: 0 as const, x: "hello", y: 42 };
		const encoded0 = codec.encode(variant0);
		const decoded0 = codec.decode(encoded0);
		expect(decoded0).toEqual(variant0);

		const variant1 = { type: 1 as const, z: ["a", "b", "c"] };
		const encoded1 = codec.encode(variant1);
		const decoded1 = codec.decode(encoded1);
		expect(decoded1).toEqual(variant1);

		// Type inference check
		type Message = InferType<typeof schema>;
		const msg: Message = { type: 0, x: "test", y: 10 };
		if (msg.type === 0) {
			expect(msg.x).toBe("test");
		}

		// @ts-expect-error Numeric tag types only allow numeric variant keys.
		union("uint", { zabu: { value: "string" } });
	});

	test("union with string discriminant", () => {
		const schema = union("string", {
			user: { name: "string", age: "int" },
			product: { title: "string", price: "uint" },
		});

		const codec = createCodec(schema);

		const user = { type: "user" as const, name: "Alice", age: 30 };
		const encodedUser = codec.encode(user);
		const decodedUser = codec.decode(encodedUser);
		expect(decodedUser).toEqual(user);

		const product = { type: "product" as const, title: "Widget", price: 1000 };
		const encodedProduct = codec.encode(product);
		const decodedProduct = codec.decode(encodedProduct);
		expect(decodedProduct).toEqual(product);

		type Message = InferType<typeof schema>;
		const message: Message = { type: "user", name: "Alice", age: 30 };
		if (message.type === "user") {
			message.name = "Bob";
			expect(message.name).toBe("Bob");
		}
	});

	test("union with custom tag name", () => {
		const schema = union({
			tagName: "kind",
			tagType: "string",
			variants: {
				event: { type: "string", value: "uint" },
				error: { message: "string" },
			},
		});

		const codec = createCodec(schema);

		const event = { kind: "event" as const, type: "external", value: 42 };
		const encodedEvent = codec.encode(event);
		const decodedEvent = codec.decode(encodedEvent);
		expect(decodedEvent).toEqual(event);

		const error = { kind: "error" as const, message: "failed" };
		const encodedError = codec.encode(error);
		const decodedError = codec.decode(encodedError);
		expect(decodedError).toEqual(error);

		type Message = InferType<typeof schema>;
		const message: Message = { kind: "event", type: "external", value: 42 };
		if (message.kind === "event") {
			message.type = "internal";
			expect(message.type).toBe("internal");
		}

		// @ts-expect-error Numeric tag types only allow numeric variant keys.
		union({ tagName: "kind", tagType: "int", variants: { zabu: { value: "string" } } });
	});

	test("lazy union with custom tag name", () => {
		const schema = () =>
			union({
				tagName: "kind",
				tagType: "uint",
				variants: {
					0: { x: "string" },
					1: { y: "uint" },
				},
			});

		const codec = createCodec(schema);
		const value = { kind: 1 as const, y: 300 };

		expect(codec.encode(value)).toEqual(new Uint8Array([1, 172, 2]));
		expect(codec.decode(new Uint8Array([1, 172, 2]))).toEqual(value);
	});

	test("untagged union with primitive variants", () => {
		const schema = union(["string", "uint"]);
		const codec = createCodec(schema);

		expect(codec.encode("hello")).toEqual(new Uint8Array([0, 5, 104, 101, 108, 108, 111]));
		expect(codec.decode(new Uint8Array([0, 5, 104, 101, 108, 108, 111]))).toBe("hello");

		expect(codec.encode(42)).toEqual(new Uint8Array([1, 42]));
		expect(codec.decode(new Uint8Array([1, 42]))).toBe(42);

		type Message = InferType<typeof schema>;
		const text: Message = "test";
		const count: Message = 123;
		expect([text, count]).toEqual(["test", 123]);
	});

	test("untagged union matches array element schemas", () => {
		const schema = union([array("string"), array("uint")]);
		const codec = createCodec(schema);

		expect(codec.encode(["a", "bc"])).toEqual(new Uint8Array([0, 2, 1, 97, 2, 98, 99]));
		expect(codec.decode(new Uint8Array([0, 2, 1, 97, 2, 98, 99]))).toEqual(["a", "bc"]);

		expect(codec.encode([1, 2])).toEqual(new Uint8Array([1, 2, 1, 2]));
		expect(codec.decode(new Uint8Array([1, 2, 1, 2]))).toEqual([1, 2]);
	});

	test("untagged union with object variants", () => {
		const schema = union([
			object({ name: "string", age: "int" }),
			object({ title: "string", price: "uint" }),
		]);

		const codec = createCodec(schema);

		const user = { name: "Alice", age: 30 };
		expect(codec.decode(codec.encode(user))).toEqual(user);

		const product = { title: "Widget", price: 1000 };
		expect(codec.decode(codec.encode(product))).toEqual(product);
		expect(() => codec.encode({ unknown: true } as any)).toThrow("No matching union variant");
		expect(() => codec.decode(new Uint8Array([2]))).toThrow("Unknown union variant: 2");
	});

	test("complex nested structure", () => {
		const schema = object({
			id: "string",
			updates: array("uint8Array"),
			metadata: optional(
				object({
					version: "int",
					tags: array("string"),
				}),
			),
		});

		const codec = createCodec(schema);

		const value = {
			id: "doc-123",
			updates: [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])],
			metadata: {
				version: 5,
				tags: ["important", "draft"],
			},
		};

		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);

		expect(decoded.id).toBe(value.id);
		expect(decoded.updates).toEqual(value.updates);
		expect(decoded.metadata).toEqual(value.metadata);
	});

	test("uses the expected wire format for Sync.ts messages", () => {
		// Simulate a message type similar to what's in Sync.ts
		const syncMessageSchema = object({
			type: "uint",
			documentId: "string",
			clientSignature: "string",
			localSignature: "string",
			version: "int",
			stateVector: "uint8Array",
		});

		const { encode, decode } = createCodec(syncMessageSchema);

		const message = {
			type: 23,
			documentId: "doc-123",
			clientSignature: "client-signature",
			localSignature: "local-signature",
			version: 1,
			stateVector: new Uint8Array([1, 2, 3]),
		};

		const encodedWithCodec = encode(message);

		const expectedBytes = new Uint8Array([
			23, 7, 100, 111, 99, 45, 49, 50, 51, 16, 99, 108, 105, 101, 110, 116, 45, 115, 105, 103, 110,
			97, 116, 117, 114, 101, 15, 108, 111, 99, 97, 108, 45, 115, 105, 103, 110, 97, 116, 117, 114,
			101, 1, 3, 1, 2, 3,
		]);

		expect(encodedWithCodec).toEqual(expectedBytes);

		expect(decode(encodedWithCodec)).toEqual(message);
		expect(decode(createDecoder(encodedWithCodec))).toEqual(message);
	});

	test("recursive type", () => {
		type RecursiveSchema = UnionSchema<
			"string",
			{
				number: { number: "int" };
				child: { child: () => RecursiveSchema };
			}
		>;

		const schema: RecursiveSchema = union("string", {
			number: { number: "int" },
			child: { child: (): RecursiveSchema => schema },
		});

		const codec = createCodec(schema);

		const value = { type: "child" as const, child: { type: "number" as const, number: 42 } };
		const encoded = codec.encode(value);
		const decoded = codec.decode(encoded);
		expect(decoded).toEqual(value);
	});

	test("lazy schemas support date, bigint, and set", () => {
		const schema = () =>
			object({
				createdAt: "date",
				ids: set(bigint()),
			});

		const codec = createCodec(schema);
		const value = {
			createdAt: new Date("2026-06-26T12:34:56.789Z"),
			ids: new Set([1n, 2n ** 70n, -(2n ** 70n)]),
		};

		const decoded = codec.decode(codec.encode(value));

		expect(decoded.createdAt.getTime()).toBe(value.createdAt.getTime());
		expect([...decoded.ids]).toEqual([...value.ids]);
	});
});
