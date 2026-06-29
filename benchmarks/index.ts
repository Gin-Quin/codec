import { fromBinary, fromJson, toBinary, toJson } from "@bufbuild/protobuf";
import { StructSchema } from "@bufbuild/protobuf/wkt";
import {
	array as bunkerArray,
	boolean as bunkerBoolean,
	bunker,
	debunker,
	integer as bunkerInteger,
	number as bunkerNumber,
	object as bunkerObject,
	positiveInteger as bunkerPositiveInteger,
	type Schema as BunkerSchema,
	string as bunkerString,
} from "@digitak/bunker";
import { decode as messagePackDecode, encode as messagePackEncode } from "@msgpack/msgpack";
import avro from "avsc";
import { decode as cborDecode, encode as cborEncode } from "cbor-x";
import { encode as flexEncode, toObject as flexDecode } from "flatbuffers/mjs/flexbuffers.js";
import { pack as msgpackrEncode, unpack as msgpackrDecode } from "msgpackr";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deserialize as v8Deserialize, serialize as v8Serialize } from "node:v8";
import protobuf from "protobufjs";
import {
	array,
	createCodec,
	map,
	object,
	type Schema,
} from "../source/index.ts";

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type EncodedValue = ArrayBuffer | Uint8Array | string;

interface BenchmarkCase {
	avroSchema: avro.Schema;
	bunkerSchema: BunkerSchema;
	codecSchema: Schema;
	description: string;
	iterations: number;
	name: string;
	value: JsonObject;
	warmupIterations: number;
}

interface Serializer {
	format: string;
	mode: "document" | "schema" | "runtime";
	name: string;
	note?: string;
	setup: (benchmarkCase: BenchmarkCase) => SerializerAdapter;
}

interface SerializerAdapter {
	decode: (encoded: EncodedValue) => unknown;
	encode: (value: JsonObject) => EncodedValue;
}

interface UnavailableSerializer {
	format: string;
	mode: "document" | "schema" | "runtime";
	name: string;
	reason: string;
}

interface RunSample {
	decodeMs: number;
	encodeMs: number;
	roundTripMs: number;
}

interface Stats {
	maxMs: number;
	medianMs: number;
	minMs: number;
	p95Ms: number;
}

interface BenchmarkResult {
	bytes?: number;
	decode?: Stats;
	encode?: Stats;
	error?: string;
	format: string;
	mode: string;
	name: string;
	note?: string;
	opsPerSecond?: {
		decode: number;
		encode: number;
		roundTrip: number;
	};
	reason?: string;
	roundTrip?: Stats;
	status: "failed" | "ok" | "skipped";
}

interface BenchmarkReport {
	cases: Array<{
		description: string;
		inputJsonBytes: number;
		iterations: number;
		name: string;
		results: BenchmarkResult[];
		warmupIterations: number;
	}>;
	generatedAt: string;
	runtime: {
		bun?: string;
		node?: string;
	};
	samples: number;
	serializers: Array<{
		format: string;
		mode: string;
		name: string;
		note?: string;
		reason?: string;
		status: "available" | "unavailable";
	}>;
}

interface CliOptions {
	serializerNames?: string[];
	tableMode: boolean;
}

const SAMPLES = 7;
const RESULTS_PATH = join(dirname(fileURLToPath(import.meta.url)), "results.json");
const TEXT_ENCODER = new TextEncoder();
let sink = 0;

const protobufStructType = protobuf.parse(`
syntax = "proto3";
package google.protobuf;

message Struct {
	map<string, Value> fields = 1;
}

message Value {
	oneof kind {
		NullValue null_value = 1;
		double number_value = 2;
		string string_value = 3;
		bool bool_value = 4;
		Struct struct_value = 5;
		ListValue list_value = 6;
	}
}

message ListValue {
	repeated Value values = 1;
}

enum NullValue {
	NULL_VALUE = 0;
}
`).root.lookupType("google.protobuf.Struct");

const profileSchema = object({
	id: "uint",
	username: "string",
	active: "boolean",
	age: "uint",
	rating: "float64",
	score: "int",
	summary: "string",
	settings: object({
		theme: "string",
		email: "boolean",
		sms: "boolean",
		locale: "string",
		timezone: "string",
		refreshInterval: "uint",
	}),
	tags: array("string"),
	counters: map("uint"),
	ratios: map("float64"),
});

const bunkerProfileSchema = bunkerObject({
	id: bunkerPositiveInteger,
	username: bunkerString,
	active: bunkerBoolean,
	age: bunkerPositiveInteger,
	rating: bunkerNumber,
	score: bunkerInteger,
	summary: bunkerString,
	settings: bunkerObject({
		theme: bunkerString,
		email: bunkerBoolean,
		sms: bunkerBoolean,
		locale: bunkerString,
		timezone: bunkerString,
		refreshInterval: bunkerPositiveInteger,
	}),
	tags: bunkerArray(bunkerString),
	counters: createBunkerObjectFromKeys("counter", 16, bunkerPositiveInteger),
	ratios: createBunkerObjectFromKeys("ratio", 12, bunkerNumber),
});

const taskBoardSchema = object({
	boardId: "string",
	title: "string",
	revision: "uint",
	archived: "boolean",
	owner: object({
		id: "uint",
		name: "string",
		reputation: "int",
	}),
	columns: array(
		object({
			id: "string",
			name: "string",
			position: "uint",
		}),
	),
	tasks: array(
		object({
			id: "uint",
			columnId: "string",
			title: "string",
			body: "string",
			done: "boolean",
			priority: "uint",
			estimate: "float64",
			assignee: object({
				id: "uint",
				name: "string",
			}),
			labels: array("string"),
		}),
	),
	totals: map("uint"),
});

const bunkerTaskSchema = bunkerObject({
	boardId: bunkerString,
	title: bunkerString,
	revision: bunkerPositiveInteger,
	archived: bunkerBoolean,
	owner: bunkerObject({
		id: bunkerPositiveInteger,
		name: bunkerString,
		reputation: bunkerInteger,
	}),
	columns: bunkerArray(
		bunkerObject({
			id: bunkerString,
			name: bunkerString,
			position: bunkerPositiveInteger,
		}),
	),
	tasks: bunkerArray(
		bunkerObject({
			id: bunkerPositiveInteger,
			columnId: bunkerString,
			title: bunkerString,
			body: bunkerString,
			done: bunkerBoolean,
			priority: bunkerPositiveInteger,
			estimate: bunkerNumber,
			assignee: bunkerObject({
				id: bunkerPositiveInteger,
				name: bunkerString,
			}),
			labels: bunkerArray(bunkerString),
		}),
	),
	totals: bunkerObject({
		todo: bunkerPositiveInteger,
		doing: bunkerPositiveInteger,
		review: bunkerPositiveInteger,
		blocked: bunkerPositiveInteger,
		done: bunkerPositiveInteger,
	}),
});

const searchIndexSchema = object({
	documentId: "string",
	title: "string",
	snapshot: "string",
	metrics: object({
		version: "uint",
		words: "uint",
		score: "uint",
		published: "boolean",
	}),
	sections: array(
		object({
			id: "string",
			heading: "string",
			depth: "uint",
			wordCount: "uint",
			checksum: "uint",
			terms: array("string"),
		}),
	),
	index: map(
		object({
			sectionId: "string",
			offset: "uint",
			length: "uint",
			weight: "uint",
			label: "string",
		}),
	),
});

const bunkerSearchIndexEntrySchema = bunkerObject({
	sectionId: bunkerString,
	offset: bunkerPositiveInteger,
	length: bunkerPositiveInteger,
	weight: bunkerPositiveInteger,
	label: bunkerString,
});

const bunkerSearchIndexSchema = bunkerObject({
	documentId: bunkerString,
	title: bunkerString,
	snapshot: bunkerString,
	metrics: bunkerObject({
		version: bunkerPositiveInteger,
		words: bunkerPositiveInteger,
		score: bunkerPositiveInteger,
		published: bunkerBoolean,
	}),
	sections: bunkerArray(
		bunkerObject({
			id: bunkerString,
			heading: bunkerString,
			depth: bunkerPositiveInteger,
			wordCount: bunkerPositiveInteger,
			checksum: bunkerPositiveInteger,
			terms: bunkerArray(bunkerString),
		}),
	),
	index: createBunkerObjectFromKeys("key", 160, bunkerSearchIndexEntrySchema, 3),
});

const cases: BenchmarkCase[] = [
	{
		avroSchema: {
			type: "record",
			name: "ProfilePayload",
			fields: [
				{ name: "id", type: "int" },
				{ name: "username", type: "string" },
				{ name: "active", type: "boolean" },
				{ name: "age", type: "int" },
				{ name: "rating", type: "double" },
				{ name: "score", type: "int" },
				{ name: "summary", type: "string" },
				{
					name: "settings",
					type: {
						type: "record",
						name: "ProfileSettings",
						fields: [
							{ name: "theme", type: "string" },
							{ name: "email", type: "boolean" },
							{ name: "sms", type: "boolean" },
							{ name: "locale", type: "string" },
							{ name: "timezone", type: "string" },
							{ name: "refreshInterval", type: "int" },
						],
					},
				},
				{ name: "tags", type: { type: "array", items: "string" } },
				{ name: "counters", type: { type: "map", values: "int" } },
				{ name: "ratios", type: { type: "map", values: "double" } },
			],
		},
		bunkerSchema: bunkerProfileSchema,
		codecSchema: profileSchema,
		description: "One medium nested object with strings, numbers, booleans, arrays, and maps.",
		iterations: 8_000,
		name: "profile",
		value: createProfile(),
		warmupIterations: 500,
	},
	{
		avroSchema: {
			type: "record",
			name: "TaskBoardPayload",
			fields: [
				{ name: "boardId", type: "string" },
				{ name: "title", type: "string" },
				{ name: "revision", type: "int" },
				{ name: "archived", type: "boolean" },
				{
					name: "owner",
					type: {
						type: "record",
						name: "BoardOwner",
						fields: [
							{ name: "id", type: "int" },
							{ name: "name", type: "string" },
							{ name: "reputation", type: "int" },
						],
					},
				},
				{
					name: "columns",
					type: {
						type: "array",
						items: {
							type: "record",
							name: "BoardColumn",
							fields: [
								{ name: "id", type: "string" },
								{ name: "name", type: "string" },
								{ name: "position", type: "int" },
							],
						},
					},
				},
				{
					name: "tasks",
					type: {
						type: "array",
						items: {
							type: "record",
							name: "BoardTask",
							fields: [
								{ name: "id", type: "int" },
								{ name: "columnId", type: "string" },
								{ name: "title", type: "string" },
								{ name: "body", type: "string" },
								{ name: "done", type: "boolean" },
								{ name: "priority", type: "int" },
								{ name: "estimate", type: "double" },
								{
									name: "assignee",
									type: {
										type: "record",
										name: "TaskAssignee",
										fields: [
											{ name: "id", type: "int" },
											{ name: "name", type: "string" },
										],
									},
								},
								{ name: "labels", type: { type: "array", items: "string" } },
							],
						},
					},
				},
				{ name: "totals", type: { type: "map", values: "int" } },
			],
		},
		bunkerSchema: bunkerTaskSchema,
		codecSchema: taskBoardSchema,
		description: "A collection-like object with nested records and repeated child objects.",
		iterations: 350,
		name: "task-board",
		value: createTaskBoard(120),
		warmupIterations: 30,
	},
	{
		avroSchema: {
			type: "record",
			name: "SearchIndexPayload",
			fields: [
				{ name: "documentId", type: "string" },
				{ name: "title", type: "string" },
				{ name: "snapshot", type: "string" },
				{
					name: "metrics",
					type: {
						type: "record",
						name: "SearchMetrics",
						fields: [
							{ name: "version", type: "int" },
							{ name: "words", type: "int" },
							{ name: "score", type: "int" },
							{ name: "published", type: "boolean" },
						],
					},
				},
				{
					name: "sections",
					type: {
						type: "array",
						items: {
							type: "record",
							name: "SearchSection",
							fields: [
								{ name: "id", type: "string" },
								{ name: "heading", type: "string" },
								{ name: "depth", type: "int" },
								{ name: "wordCount", type: "int" },
								{ name: "checksum", type: "int" },
								{ name: "terms", type: { type: "array", items: "string" } },
							],
						},
					},
				},
				{
					name: "index",
					type: {
						type: "map",
						values: {
							type: "record",
							name: "SearchIndexEntry",
							fields: [
								{ name: "sectionId", type: "string" },
								{ name: "offset", type: "int" },
								{ name: "length", type: "int" },
								{ name: "weight", type: "int" },
								{ name: "label", type: "string" },
							],
						},
					},
				},
			],
		},
		bunkerSchema: bunkerSearchIndexSchema,
		codecSchema: searchIndexSchema,
		description: "A large object with a long string snapshot, arrays, and a large string-keyed index.",
		iterations: 55,
		name: "search-index",
		value: createSearchIndex(48, 160),
		warmupIterations: 5,
	},
];

const cliOptions = parseCliOptions(process.argv.slice(2));
const { serializers, unavailableSerializers } = await createSerializers();
const selectedSerializers = selectSerializers(
	serializers,
	unavailableSerializers,
	cliOptions.serializerNames,
);
const report = runBenchmarks(
	selectedSerializers.serializers,
	selectedSerializers.unavailableSerializers,
);
const reportJson = JSON.stringify(report, null, 2);

writeFileSync(RESULTS_PATH, `${reportJson}\n`);

if (cliOptions.tableMode) {
	console.table(toTableRows(report));
} else {
	console.log(reportJson);
}

if (sink === Number.MIN_SAFE_INTEGER) {
	throw new Error("unreachable");
}

function parseCliOptions(args: string[]): CliOptions {
	const serializerNames: string[] = [];
	let tableMode = false;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		if (arg === "--table") {
			tableMode = true;
			continue;
		}
		if (arg === "--serializer" || arg === "--serializers") {
			const value = args[index + 1];
			if (!value) {
				throw new Error(`${arg} requires a serializer name or comma-separated list`);
			}
			serializerNames.push(...parseSerializerList(value));
			index++;
			continue;
		}
		if (arg.startsWith("--serializer=")) {
			serializerNames.push(...parseSerializerList(arg.slice("--serializer=".length)));
			continue;
		}
		if (arg.startsWith("--serializers=")) {
			serializerNames.push(...parseSerializerList(arg.slice("--serializers=".length)));
			continue;
		}
		throw new Error(`Unknown benchmark option: ${arg}`);
	}

	return {
		serializerNames: serializerNames.length > 0 ? [...new Set(serializerNames)] : undefined,
		tableMode,
	};
}

function parseSerializerList(value: string): string[] {
	const names = value
		.split(",")
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
	if (names.length === 0) {
		throw new Error("Serializer list cannot be empty");
	}
	return names;
}

function selectSerializers(
	serializers: Serializer[],
	unavailableSerializers: UnavailableSerializer[],
	serializerNames?: string[],
): {
	serializers: Serializer[];
	unavailableSerializers: UnavailableSerializer[];
} {
	if (!serializerNames) {
		return { serializers, unavailableSerializers };
	}

	const availableNames = new Set([
		...serializers.map((serializer) => serializer.name),
		...unavailableSerializers.map((serializer) => serializer.name),
	]);
	const unknownNames = serializerNames.filter((name) => !availableNames.has(name));
	if (unknownNames.length > 0) {
		throw new Error(
			`Unknown serializer${unknownNames.length === 1 ? "" : "s"}: ${unknownNames.join(
				", ",
			)}. Available serializers: ${[...availableNames].join(", ")}`,
		);
	}

	return {
		serializers: serializers.filter((serializer) => serializerNames.includes(serializer.name)),
		unavailableSerializers: unavailableSerializers.filter((serializer) =>
			serializerNames.includes(serializer.name),
		),
	};
}

async function createSerializers(): Promise<{
	serializers: Serializer[];
	unavailableSerializers: UnavailableSerializer[];
}> {
	const unavailableSerializers: UnavailableSerializer[] = [];

	const bson = await loadBson();
	if (!bson) {
		unavailableSerializers.push({
			format: "BSON",
			mode: "document",
			name: "bson",
			reason: "BSON package could not be imported in this runtime.",
		});
	}

	const serializers: Serializer[] = [
		{
			format: "codec binary",
			mode: "schema",
			name: "codec",
			setup: (benchmarkCase) => {
				const codec = createCodec(benchmarkCase.codecSchema);
				return {
					decode: (encoded) => codec.decode(encoded as Uint8Array),
					encode: (value) => codec.encode(value as never),
				};
			},
		},
		{
			format: "codec binary",
			mode: "schema",
			name: "codec-view",
			note: "Uses encodeView(), so the encoded value is a view into codec's internal encoder buffer.",
			setup: (benchmarkCase) => {
				const codec = createCodec(benchmarkCase.codecSchema);
				return {
					decode: (encoded) => codec.decode(encoded as Uint8Array),
					encode: (value) => codec.encodeView(value as never),
				};
			},
		},
		{
			format: "JSON text",
			mode: "document",
			name: "json",
			setup: () => ({
				decode: (encoded) => JSON.parse(encoded as string),
				encode: (value) => JSON.stringify(value),
			}),
		},
		{
			format: "Bunker",
			mode: "document",
			name: "bunker",
			note: "Uses bunker(value), so Bunker discovers and embeds the schema on each encode.",
			setup: () => ({
				decode: (encoded) => debunker(encoded as Uint8Array),
				encode: (value) => bunker(value),
			}),
		},
		{
			format: "Bunker",
			mode: "schema",
			name: "bunker-schema",
			note: "Passes an explicit schema to bunker(value, schema), so Bunker does not discover the schema during encode.",
			setup: (benchmarkCase) => ({
				decode: (encoded) => debunker(encoded as Uint8Array),
				encode: (value) => bunker(value, benchmarkCase.bunkerSchema),
			}),
		},
		{
			format: "MessagePack",
			mode: "document",
			name: "msgpackr",
			setup: () => ({
				decode: (encoded) => msgpackrDecode(encoded as Uint8Array),
				encode: (value) => msgpackrEncode(value),
			}),
		},
		{
			format: "MessagePack",
			mode: "document",
			name: "@msgpack/msgpack",
			setup: () => ({
				decode: (encoded) => messagePackDecode(encoded as Uint8Array),
				encode: (value) => messagePackEncode(value),
			}),
		},
		{
			format: "CBOR",
			mode: "document",
			name: "cbor-x",
			setup: () => ({
				decode: (encoded) => cborDecode(encoded as Uint8Array),
				encode: (value) => cborEncode(value),
			}),
		},
		{
			format: "Avro",
			mode: "schema",
			name: "avsc",
			setup: (benchmarkCase) => {
				const type = avro.Type.forSchema(benchmarkCase.avroSchema);
				return {
					decode: (encoded) => type.fromBuffer(encoded as Buffer),
					encode: (value) => type.toBuffer(value),
				};
			},
		},
		{
			format: "Protocol Buffers Struct",
			mode: "document",
			name: "protobufjs",
			setup: () => ({
				decode: (encoded) => protobufStructToJson(protobufStructType.decode(encoded as Uint8Array)),
				encode: (value) =>
					protobufStructType.encode(protobufStructType.create(jsonToProtobufStruct(value))).finish(),
			}),
		},
		{
			format: "Protocol Buffers Struct",
			mode: "document",
			name: "@bufbuild/protobuf",
			setup: () => ({
				decode: (encoded) =>
					toJson(StructSchema, fromBinary(StructSchema, encoded as Uint8Array)) as JsonObject,
				encode: (value) => toBinary(StructSchema, fromJson(StructSchema, value)),
			}),
		},
		{
			format: "V8 serialized value",
			mode: "runtime",
			name: "v8",
			setup: () => ({
				decode: (encoded) => v8Deserialize(encoded as Uint8Array),
				encode: (value) => v8Serialize(value),
			}),
		},
		{
			format: "FlexBuffers",
			mode: "document",
			name: "flatbuffers-flexbuffers",
			note: "Uses the FlatBuffers package's FlexBuffers object encoder.",
			setup: () => ({
				decode: (encoded) => flexDecode(encoded as ArrayBuffer) as JsonObject,
				encode: (value) => toExactArrayBuffer(flexEncode(value)),
			}),
		},
	];

	if (bson) {
		serializers.push({
			format: "BSON",
			mode: "document",
			name: "bson",
			setup: () => ({
				decode: (encoded) => bson.deserialize(encoded as Uint8Array),
				encode: (value) => bson.serialize(value),
			}),
		});
	}

	return { serializers, unavailableSerializers };
}

async function loadBson(): Promise<
	| {
			deserialize: (buffer: Uint8Array) => unknown;
			serialize: (value: JsonObject) => Uint8Array;
	  }
	| undefined
> {
	const processWithBuiltin = globalThis.process as
		| { getBuiltinModule?: (name: string) => object | undefined }
		| undefined;
	const originalGetBuiltinModule = processWithBuiltin?.getBuiltinModule;

	if (processWithBuiltin && originalGetBuiltinModule) {
		processWithBuiltin.getBuiltinModule = function getBuiltinModule(
			name: string,
		): object | undefined {
			if (name === "v8") {
				return {};
			}
			return originalGetBuiltinModule.call(this, name);
		};
	}

	try {
		const module = await import("bson");
		return {
			deserialize: module.deserialize,
			serialize: module.serialize,
		};
	} catch {
		return undefined;
	} finally {
		if (processWithBuiltin && originalGetBuiltinModule) {
			processWithBuiltin.getBuiltinModule = originalGetBuiltinModule;
		}
	}
}

function runBenchmarks(
	serializers: Serializer[],
	unavailableSerializers: UnavailableSerializer[],
): BenchmarkReport {
	return {
		cases: cases.map((benchmarkCase) => ({
			description: benchmarkCase.description,
			inputJsonBytes: encodedByteLength(JSON.stringify(benchmarkCase.value)),
			iterations: benchmarkCase.iterations,
			name: benchmarkCase.name,
			results: [
				...serializers.map((serializer) => runSerializer(benchmarkCase, serializer)),
				...unavailableSerializers.map((serializer) => ({
					format: serializer.format,
					mode: serializer.mode,
					name: serializer.name,
					reason: serializer.reason,
					status: "skipped" as const,
				})),
			],
			warmupIterations: benchmarkCase.warmupIterations,
		})),
		generatedAt: new Date().toISOString(),
		runtime: {
			bun: globalThis.Bun?.version,
			node: process.versions.node,
		},
		samples: SAMPLES,
		serializers: [
			...serializers.map((serializer) => ({
				format: serializer.format,
				mode: serializer.mode,
				name: serializer.name,
				note: serializer.note,
				status: "available" as const,
			})),
			...unavailableSerializers.map((serializer) => ({
				format: serializer.format,
				mode: serializer.mode,
				name: serializer.name,
				reason: serializer.reason,
				status: "unavailable" as const,
			})),
		],
	};
}

function runSerializer(benchmarkCase: BenchmarkCase, serializer: Serializer): BenchmarkResult {
	try {
		const adapter = serializer.setup(benchmarkCase);
		const encoded = adapter.encode(benchmarkCase.value);
		const decoded = adapter.decode(encoded);
		assertJsonEqual(decoded, benchmarkCase.value);

		runIterations(adapter, benchmarkCase.value, benchmarkCase.warmupIterations);

		const samples = Array.from({ length: SAMPLES }, () =>
			runIterations(adapter, benchmarkCase.value, benchmarkCase.iterations),
		);
		const encode = summarize(samples.map((sample) => sample.encodeMs / benchmarkCase.iterations));
		const decode = summarize(samples.map((sample) => sample.decodeMs / benchmarkCase.iterations));
		const roundTrip = summarize(
			samples.map((sample) => sample.roundTripMs / benchmarkCase.iterations),
		);

		return {
			bytes: encodedByteLength(encoded),
			decode,
			encode,
			format: serializer.format,
			mode: serializer.mode,
			name: serializer.name,
			note: serializer.note,
			opsPerSecond: {
				decode: round(1000 / decode.medianMs, 2),
				encode: round(1000 / encode.medianMs, 2),
				roundTrip: round(1000 / roundTrip.medianMs, 2),
			},
			roundTrip,
			status: "ok",
		};
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			format: serializer.format,
			mode: serializer.mode,
			name: serializer.name,
			note: serializer.note,
			status: "failed",
		};
	}
}

function runIterations(
	adapter: SerializerAdapter,
	value: JsonObject,
	iterations: number,
): RunSample {
	let decodeMs = 0;
	let encodeMs = 0;

	for (let index = 0; index < iterations; index++) {
		const encodeStart = performance.now();
		const encoded = adapter.encode(value);
		encodeMs += performance.now() - encodeStart;

		const decodeStart = performance.now();
		const decoded = adapter.decode(encoded);
		decodeMs += performance.now() - decodeStart;
		sink ^= touch(decoded);
	}

	return {
		decodeMs,
		encodeMs,
		roundTripMs: encodeMs + decodeMs,
	};
}

function summarize(samples: number[]): Stats {
	const sorted = [...samples].sort((left, right) => left - right);
	return {
		maxMs: round(sorted[sorted.length - 1]!, 6),
		medianMs: round(percentile(sorted, 0.5), 6),
		minMs: round(sorted[0]!, 6),
		p95Ms: round(percentile(sorted, 0.95), 6),
	};
}

function percentile(sortedSamples: number[], percentileValue: number): number {
	const index = Math.ceil(sortedSamples.length * percentileValue) - 1;
	return sortedSamples[Math.max(0, Math.min(index, sortedSamples.length - 1))]!;
}

function toTableRows(report: BenchmarkReport): Array<Record<string, unknown>> {
	return report.cases.flatMap((benchmarkCase) =>
		benchmarkCase.results.map((result) => ({
			bytes: result.bytes ?? "",
			case: benchmarkCase.name,
			decode_us: result.decode ? round(result.decode.medianMs * 1000, 2) : "",
			encode_us: result.encode ? round(result.encode.medianMs * 1000, 2) : "",
			error: result.error ?? result.reason ?? "",
			format: result.format,
			mode: result.mode,
			round_trip_us: result.roundTrip ? round(result.roundTrip.medianMs * 1000, 2) : "",
			round_trip_ops_s: result.opsPerSecond?.roundTrip ?? "",
			serializer: result.name,
			status: result.status,
		})),
	);
}

function encodedByteLength(encoded: EncodedValue): number {
	if (typeof encoded === "string") {
		return TEXT_ENCODER.encode(encoded).byteLength;
	}
	return encoded.byteLength;
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
		return bytes.buffer as ArrayBuffer;
	}
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function assertJsonEqual(actual: unknown, expected: JsonValue): void {
	if (!jsonEqual(actual, expected)) {
		throw new Error(
			`round trip mismatch: expected ${stableStringify(expected)}, received ${stableStringify(
				actual,
			)}`,
		);
	}
}

function jsonEqual(left: unknown, right: JsonValue): boolean {
	if (left === right) {
		return true;
	}
	if (typeof left !== typeof right) {
		return false;
	}
	if (left === null || right === null) {
		return left === right;
	}
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
			return false;
		}
		return left.every((value, index) => jsonEqual(value, right[index]!));
	}
	if (typeof left === "object" && typeof right === "object") {
		const leftRecord = left as Record<string, unknown>;
		const rightRecord = right as Record<string, JsonValue>;
		const leftKeys = Object.keys(leftRecord).sort();
		const rightKeys = Object.keys(rightRecord).sort();
		if (leftKeys.length !== rightKeys.length) {
			return false;
		}
		return leftKeys.every(
			(key, index) => key === rightKeys[index] && jsonEqual(leftRecord[key], rightRecord[key]!),
		);
	}
	return false;
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
		.join(",")}}`;
}

function jsonToProtobufStruct(value: JsonObject): { fields: Record<string, unknown> } {
	const fields: Record<string, unknown> = {};
	for (const [key, fieldValue] of Object.entries(value)) {
		fields[key] = jsonToProtobufValue(fieldValue);
	}
	return { fields };
}

function jsonToProtobufValue(value: JsonValue): Record<string, unknown> {
	if (value === null) {
		return { nullValue: 0 };
	}
	if (Array.isArray(value)) {
		return { listValue: { values: value.map(jsonToProtobufValue) } };
	}
	switch (typeof value) {
		case "boolean":
			return { boolValue: value };
		case "number":
			return { numberValue: value };
		case "object":
			return { structValue: jsonToProtobufStruct(value) };
		case "string":
			return { stringValue: value };
	}
}

function protobufStructToJson(value: unknown): JsonObject {
	const structValue = toProtobufJsonObject(value) as { fields?: Record<string, unknown> };
	const result: JsonObject = {};
	for (const [key, fieldValue] of Object.entries(structValue.fields ?? {})) {
		result[key] = protobufValueToJson(fieldValue);
	}
	return result;
}

function protobufValueToJson(value: unknown): JsonValue {
	const field = toProtobufJsonObject(value) as {
		boolValue?: boolean;
		listValue?: { values?: unknown[] };
		nullValue?: number;
		numberValue?: number;
		stringValue?: string;
		structValue?: unknown;
	};
	if (field.nullValue !== undefined) {
		return null;
	}
	if (field.numberValue !== undefined) {
		return field.numberValue;
	}
	if (field.stringValue !== undefined) {
		return field.stringValue;
	}
	if (field.boolValue !== undefined) {
		return field.boolValue;
	}
	if (field.structValue !== undefined) {
		return protobufStructToJson(field.structValue);
	}
	if (field.listValue !== undefined) {
		return (field.listValue.values ?? []).map(protobufValueToJson);
	}
	throw new Error(`Unknown protobuf Struct value: ${stableStringify(value)}`);
}

function toProtobufJsonObject(value: unknown): unknown {
	const maybeMessage = value as { toJSON?: () => unknown };
	return typeof maybeMessage.toJSON === "function" ? maybeMessage.toJSON() : value;
}

function touch(value: unknown): number {
	if (Array.isArray(value)) {
		return value.length;
	}
	if (value && typeof value === "object") {
		return Object.keys(value).length;
	}
	if (typeof value === "string") {
		return value.length;
	}
	if (typeof value === "number") {
		return value | 0;
	}
	return value === true ? 1 : 0;
}

function round(value: number, decimals: number): number {
	const multiplier = 10 ** decimals;
	return Math.round(value * multiplier) / multiplier;
}

function createProfile(): JsonObject {
	return {
		active: true,
		age: 34,
		counters: createNumberMap("counter", 16, 2),
		id: 42,
		rating: 98.75,
		ratios: createRatioMap("ratio", 12),
		score: -17,
		settings: {
			email: true,
			locale: "en-US",
			refreshInterval: 30,
			sms: false,
			theme: "system",
			timezone: "Europe/Paris",
		},
		summary: createText(320, 11),
		tags: createStringList("tag", 8),
		username: "ada-lovelace",
	};
}

function createTaskBoard(taskCount: number): JsonObject {
	const columns = ["todo", "doing", "review", "blocked", "done"];
	const tasks = Array.from({ length: taskCount }, (_, index) => ({
		assignee: {
			id: (index % 12) + 1,
			name: `User ${index % 12}`,
		},
		body: createText(96 + (index % 5) * 12, index),
		columnId: columns[index % columns.length]!,
		done: index % 4 === 0,
		estimate: 1.5 + (index % 9) * 0.75,
		id: index + 1,
		labels: createStringList(`label-${index % 7}`, 3 + (index % 3)),
		priority: (index % 5) + 1,
		title: `Task ${index + 1}`,
	}));

	return {
		archived: false,
		boardId: "board-2026-roadmap",
		columns: columns.map((column, index) => ({
			id: column,
			name: column.toUpperCase(),
			position: index,
		})),
		owner: {
			id: 7,
			name: "Grace Hopper",
			reputation: 2048,
		},
		revision: 148,
		tasks,
		title: "Product Roadmap",
		totals: Object.fromEntries(columns.map((column) => [column, tasks.filter((task) => task.columnId === column).length])),
	};
}

function createSearchIndex(sectionCount: number, entryCount: number): JsonObject {
	const sections = Array.from({ length: sectionCount }, (_, index) => ({
		checksum: (index * 76543) % 1_000_000,
		depth: index % 4,
		heading: `Section ${index + 1}`,
		id: `sec-${index + 1}`,
		terms: createStringList(`term-${index % 13}`, 5),
		wordCount: 180 + index * 7,
	}));

	const indexEntries: Record<string, JsonValue> = {};
	for (let index = 0; index < entryCount; index++) {
		const section = sections[index % sections.length]!;
		indexEntries[`key-${index.toString().padStart(3, "0")}`] = {
			label: `Match ${index}`,
			length: 12 + (index % 31),
			offset: index * 17,
			sectionId: section.id,
			weight: (index % 19) + 1,
		};
	}

	return {
		documentId: "doc-search-2026",
		index: indexEntries,
		metrics: {
			published: true,
			score: 87_125,
			version: 6,
			words: 18_240,
		},
		sections,
		snapshot: createText(4096, 29),
		title: "Search Index Snapshot",
	};
}

function createNumberMap(prefix: string, count: number, multiplier: number): JsonObject {
	return Object.fromEntries(
		Array.from({ length: count }, (_, index) => [`${prefix}-${index}`, (index + 1) * multiplier]),
	) as JsonObject;
}

function createRatioMap(prefix: string, count: number): JsonObject {
	return Object.fromEntries(
		Array.from({ length: count }, (_, index) => [`${prefix}-${index}`, round((index + 1) / 13, 4)]),
	) as JsonObject;
}

function createBunkerObjectFromKeys(
	prefix: string,
	count: number,
	schema: BunkerSchema,
	padStart = 0,
): BunkerSchema {
	const fields: Record<string, BunkerSchema> = {};
	for (let index = 0; index < count; index++) {
		const key =
			padStart > 0
				? `${prefix}-${index.toString().padStart(padStart, "0")}`
				: `${prefix}-${index}`;
		fields[key] = schema;
	}
	return bunkerObject(fields);
}

function createStringList(prefix: string, count: number): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
}

function createText(length: number, seed: number): string {
	const words = [
		"alpha",
		"bravo",
		"charlie",
		"delta",
		"echo",
		"foxtrot",
		"golf",
		"hotel",
		"india",
		"juliet",
		"kilo",
		"lima",
		"mike",
		"november",
		"oscar",
		"papa",
	];
	let text = "";
	let index = seed;
	while (text.length < length) {
		text += `${words[index % words.length]} `;
		index += 7;
	}
	return text.slice(0, length);
}
