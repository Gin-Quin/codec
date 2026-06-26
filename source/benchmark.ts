import {
	type Codec,
	createCodec,
	createDecoder,
	createEncoder,
	type InferType,
	readVarInt,
	readVarString,
	readVarUint,
	readVarUint8Array,
	type Schema,
	toUint8ArrayView,
	writeVarInt,
	writeVarString,
	writeVarUint,
	writeVarUint8Array,
} from "./index";
import { array, map, object, optional, tuple } from "./schema";

interface BenchmarkCase<T extends Schema> {
	compileIterations: number;
	iterations: number;
	name: string;
	schema: T;
	samples: number;
	value: InferType<T>;
	warmupIterations: number;
}

interface RunResult {
	bytes: number;
	decodeMs: number;
	encodeMs: number;
	iterations: number;
	totalMs: number;
}

interface RunStats {
	max: number;
	median: number;
	min: number;
	p95: number;
}

interface OperationBenchmarkCase {
	iterations: number;
	name: string;
	run: () => number;
	samples: number;
	warmupIterations: number;
}

const smallObjectSchema = object({
	id: "uint",
	parentId: optional("uint"),
	title: "string",
	body: "string",
	version: "int",
	done: "boolean",
	tags: array("string"),
	metadata: optional(
		object({
			owner: "string",
			priority: "uint",
			score: "int",
		}),
	),
});

const manySmallObjectsSchema = array(smallObjectSchema);

const bigObjectSchema = object({
	documentId: "string",
	title: "string",
	snapshot: "string",
	chunks: array("uint8Array"),
	index: map(
		object({
			offset: "uint",
			length: "uint",
			label: "string",
		}),
	),
	history: array(
		object({
			actor: "string",
			version: "int",
			stateVector: "uint8Array",
			changes: array("uint8Array"),
		}),
	),
	stats: tuple("uint", "int", "boolean", "string"),
});

const severalBigObjectsSchema = array(bigObjectSchema);

const cases = [
	createBenchmarkCase({
		compileIterations: 1_000,
		iterations: 100,
		name: "many small objects",
		samples: 9,
		schema: manySmallObjectsSchema,
		value: createSmallObjects(10_000),
		warmupIterations: 10,
	}),
	createBenchmarkCase({
		compileIterations: 1_000,
		iterations: 8,
		name: "several very big objects",
		samples: 9,
		schema: severalBigObjectsSchema,
		value: createBigObjects(3),
		warmupIterations: 3,
	}),
];

for (const benchmarkCase of cases) {
	runCase(benchmarkCase);
}

runOperationBenchmarks();

function createBenchmarkCase<T extends Schema>(benchmarkCase: BenchmarkCase<T>): BenchmarkCase<T> {
	return benchmarkCase;
}

function runCase(benchmarkCase: BenchmarkCase<any>): void {
	const codec = createCodec(benchmarkCase.schema);
	runCodec(codec, benchmarkCase.value, benchmarkCase.warmupIterations);
	runCodec(codec, benchmarkCase.value, benchmarkCase.warmupIterations, true);

	const compileSamples = collectSamples(benchmarkCase.samples, () => {
		const start = performance.now();
		for (let index = 0; index < benchmarkCase.compileIterations; index++) {
			createCodec(benchmarkCase.schema);
		}
		return (performance.now() - start) / benchmarkCase.compileIterations;
	});

	const copySamples = collectCodecSamples(benchmarkCase, codec, false);
	const viewSamples = collectCodecSamples(benchmarkCase, codec, true);
	const bytes = copySamples[0]?.bytes ?? 0;

	console.log(`\n${benchmarkCase.name}`);
	console.log(`payload: ${formatBytes(bytes)}`);
	printStats(`compile x${benchmarkCase.compileIterations}`, compileSamples);
	printStats(
		`encode(copy)+decode x${benchmarkCase.iterations}`,
		copySamples.map((sample) => sample.totalMs / sample.iterations),
	);
	printStats(
		`encode(copy) x${benchmarkCase.iterations}`,
		copySamples.map((sample) => sample.encodeMs / sample.iterations),
	);
	printStats(
		`decode(copy) x${benchmarkCase.iterations}`,
		copySamples.map((sample) => sample.decodeMs / sample.iterations),
	);
	printStats(
		`encode(view)+decode x${benchmarkCase.iterations}`,
		viewSamples.map((sample) => sample.totalMs / sample.iterations),
	);
	printStats(
		`encode(view) x${benchmarkCase.iterations}`,
		viewSamples.map((sample) => sample.encodeMs / sample.iterations),
	);
	printStats(
		`decode(view) x${benchmarkCase.iterations}`,
		viewSamples.map((sample) => sample.decodeMs / sample.iterations),
	);
}

function runCodec<T>(codec: Codec<T>, value: T, iterations: number, useView = false): RunResult {
	let bytes = 0;
	let encodeMs = 0;
	let decodeMs = 0;

	for (let index = 0; index < iterations; index++) {
		const encodeStart = performance.now();
		const encoded = useView ? codec.encodeView(value) : codec.encode(value);
		encodeMs += performance.now() - encodeStart;

		const decodeStart = performance.now();
		codec.decode(encoded);
		decodeMs += performance.now() - decodeStart;
		bytes = encoded.byteLength;
	}

	return {
		bytes,
		decodeMs,
		encodeMs,
		iterations,
		totalMs: encodeMs + decodeMs,
	};
}

function collectCodecSamples<T extends Schema>(
	benchmarkCase: BenchmarkCase<T>,
	codec: Codec<InferType<T>>,
	useView: boolean,
): RunResult[] {
	const samples: RunResult[] = [];
	for (let index = 0; index < benchmarkCase.samples; index++) {
		samples.push(runCodec(codec, benchmarkCase.value, benchmarkCase.iterations, useView));
	}
	return samples;
}

function collectSamples(samples: number, callback: () => number): number[] {
	const result = new Array<number>(samples);
	for (let index = 0; index < samples; index++) {
		result[index] = callback();
	}
	return result;
}

function printStats(name: string, samples: number[]): void {
	const stats = summarize(samples);
	console.log(
		`${name}: min ${formatMs(stats.min)}, median ${formatMs(stats.median)}, p95 ${formatMs(stats.p95)}, max ${formatMs(stats.max)}`,
	);
}

function summarize(samples: number[]): RunStats {
	const sorted = [...samples].sort((left, right) => left - right);
	return {
		max: sorted[sorted.length - 1]!,
		median: percentile(sorted, 0.5),
		min: sorted[0]!,
		p95: percentile(sorted, 0.95),
	};
}

function percentile(sortedSamples: number[], percentileValue: number): number {
	const index = Math.ceil(sortedSamples.length * percentileValue) - 1;
	return sortedSamples[Math.max(0, Math.min(index, sortedSamples.length - 1))]!;
}

function runOperationBenchmarks(): void {
	const varUintValues = createNumberPattern(1024, 1_000_000, false);
	const varIntValues = createNumberPattern(1024, 1_000_000, true);
	const strings = createStringPattern(256);
	const bytes = createChunks(64, 512, 0);

	const cases: OperationBenchmarkCase[] = [
		{
			iterations: 1_000,
			name: "varuint mixed encode+decode",
			run: () => runVarUintRoundTrip(varUintValues),
			samples: 9,
			warmupIterations: 100,
		},
		{
			iterations: 1_000,
			name: "varint mixed encode+decode",
			run: () => runVarIntRoundTrip(varIntValues),
			samples: 9,
			warmupIterations: 100,
		},
		{
			iterations: 500,
			name: "short strings encode+decode",
			run: () => runStringRoundTrip(strings),
			samples: 9,
			warmupIterations: 50,
		},
		{
			iterations: 250,
			name: "uint8 arrays encode+decode",
			run: () => runUint8ArrayRoundTrip(bytes),
			samples: 9,
			warmupIterations: 25,
		},
	];

	console.log("\nbinary helpers");
	for (const benchmarkCase of cases) {
		runOperationCase(benchmarkCase);
	}
}

function runOperationCase(benchmarkCase: OperationBenchmarkCase): void {
	let checksum = 0;
	for (let index = 0; index < benchmarkCase.warmupIterations; index++) {
		checksum ^= benchmarkCase.run();
	}

	const samples = collectSamples(benchmarkCase.samples, () => {
		const start = performance.now();
		for (let index = 0; index < benchmarkCase.iterations; index++) {
			checksum ^= benchmarkCase.run();
		}
		return (performance.now() - start) / benchmarkCase.iterations;
	});

	if (checksum === Number.MIN_SAFE_INTEGER) {
		console.log("unreachable checksum", checksum);
	}

	printStats(`${benchmarkCase.name} x${benchmarkCase.iterations}`, samples);
}

function createSmallObjects(count: number): InferType<typeof manySmallObjectsSchema> {
	const result: InferType<typeof manySmallObjectsSchema> = new Array(count);

	for (let index = 0; index < count; index++) {
		result[index] = {
			id: index,
			parentId: index === 0 ? undefined : Math.floor((index - 1) / 2),
			title: `Note ${index}`,
			body: `Small note body ${index % 100}`,
			version: index % 2 === 0 ? index : -index,
			done: index % 7 === 0,
			tags: [`tag-${index % 12}`, `project-${index % 5}`],
			metadata:
				index % 4 === 0
					? undefined
					: {
							owner: `user-${index % 20}`,
							priority: index % 5,
							score: (index % 31) - 15,
						},
		};
	}

	return result;
}

function createBigObjects(count: number): InferType<typeof severalBigObjectsSchema> {
	const result: InferType<typeof severalBigObjectsSchema> = new Array(count);

	for (let index = 0; index < count; index++) {
		result[index] = {
			documentId: `big-document-${index}`,
			title: `Large document ${index}`,
			snapshot: createLargeString(250_000, index),
			chunks: createChunks(6, 256 * 1024, index),
			index: createIndex(500, index),
			history: createHistory(40, index),
			stats: [1_000_000 + index, -500_000 - index, index % 2 === 0, `revision-${index}`],
		};
	}

	return result;
}

function createLargeString(length: number, seed: number): string {
	const pieces: string[] = [];
	let remaining = length;
	let index = 0;

	while (remaining > 0) {
		const piece = `paragraph-${seed}-${index} Crystal notes benchmark text. `;
		pieces.push(piece.slice(0, remaining));
		remaining -= piece.length;
		index++;
	}

	return pieces.join("");
}

function createChunks(count: number, size: number, seed: number): Uint8Array[] {
	const chunks = new Array<Uint8Array>(count);

	for (let chunkIndex = 0; chunkIndex < count; chunkIndex++) {
		const chunk = new Uint8Array(size);
		for (let byteIndex = 0; byteIndex < size; byteIndex++) {
			chunk[byteIndex] = (byteIndex + chunkIndex * 17 + seed * 31) & 255;
		}
		chunks[chunkIndex] = chunk;
	}

	return chunks;
}

function createIndex(count: number, seed: number): InferType<typeof bigObjectSchema>["index"] {
	const result: InferType<typeof bigObjectSchema>["index"] = {};

	for (let index = 0; index < count; index++) {
		result[`term-${seed}-${index}`] = {
			offset: index * 37,
			length: 5 + (index % 19),
			label: `Indexed term ${seed}/${index}`,
		};
	}

	return result;
}

function createHistory(count: number, seed: number): InferType<typeof bigObjectSchema>["history"] {
	const result: InferType<typeof bigObjectSchema>["history"] = new Array(count);

	for (let index = 0; index < count; index++) {
		result[index] = {
			actor: `actor-${index % 8}`,
			version: index % 2 === 0 ? index : -index,
			stateVector: createBytePattern(64, seed + index),
			changes: [createBytePattern(512, seed + index * 3), createBytePattern(256, seed + index * 5)],
		};
	}

	return result;
}

function createBytePattern(size: number, seed: number): Uint8Array {
	const value = new Uint8Array(size);

	for (let index = 0; index < size; index++) {
		value[index] = (seed * 13 + index * 7) & 255;
	}

	return value;
}

function createNumberPattern(count: number, max: number, signed: boolean): number[] {
	const values = new Array<number>(count);
	for (let index = 0; index < count; index++) {
		const value = (index * 48271) % max;
		values[index] = signed && index % 3 === 0 ? -value : value;
	}
	return values;
}

function createStringPattern(count: number): string[] {
	const values = new Array<string>(count);
	for (let index = 0; index < count; index++) {
		values[index] = `note-${index}-tag-${index % 13}-owner-${index % 31}`;
	}
	return values;
}

function runVarUintRoundTrip(values: number[]): number {
	const encoder = createEncoder();
	for (let index = 0; index < values.length; index++) {
		writeVarUint(encoder, values[index]!);
	}

	const decoder = createDecoder(toUint8ArrayView(encoder));
	let checksum = 0;
	for (let index = 0; index < values.length; index++) {
		checksum ^= readVarUint(decoder);
	}
	return checksum;
}

function runVarIntRoundTrip(values: number[]): number {
	const encoder = createEncoder();
	for (let index = 0; index < values.length; index++) {
		writeVarInt(encoder, values[index]!);
	}

	const decoder = createDecoder(toUint8ArrayView(encoder));
	let checksum = 0;
	for (let index = 0; index < values.length; index++) {
		checksum ^= readVarInt(decoder);
	}
	return checksum;
}

function runStringRoundTrip(values: string[]): number {
	const encoder = createEncoder();
	for (let index = 0; index < values.length; index++) {
		writeVarString(encoder, values[index]!);
	}

	const decoder = createDecoder(toUint8ArrayView(encoder));
	let checksum = 0;
	for (let index = 0; index < values.length; index++) {
		checksum ^= readVarString(decoder).length;
	}
	return checksum;
}

function runUint8ArrayRoundTrip(values: Uint8Array[]): number {
	const encoder = createEncoder();
	for (let index = 0; index < values.length; index++) {
		writeVarUint8Array(encoder, values[index]!);
	}

	const decoder = createDecoder(toUint8ArrayView(encoder));
	let checksum = 0;
	for (let index = 0; index < values.length; index++) {
		checksum ^= readVarUint8Array(decoder).byteLength;
	}
	return checksum;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}

	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(2)} KiB`;
	}

	return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function formatMs(ms: number): string {
	if (ms < 1) {
		return `${ms.toFixed(3)}ms`;
	}

	return `${ms.toFixed(2)}ms`;
}
