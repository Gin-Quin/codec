import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type BenchmarkStatus = "failed" | "ok" | "skipped";

interface Stats {
	medianMs: number;
}

interface BenchmarkResult {
	bytes?: number;
	decode?: Stats;
	encode?: Stats;
	error?: string;
	format: string;
	name: string;
	reason?: string;
	roundTrip?: Stats;
	status: BenchmarkStatus;
}

interface BenchmarkCase {
	description: string;
	name: string;
	results: BenchmarkResult[];
}

interface BenchmarkReport {
	cases: BenchmarkCase[];
	generatedAt: string;
}

interface BenchmarkRow {
	bytes?: number;
	decodeUs?: number;
	encodeUs?: number;
	format: string;
	medals: Partial<Record<MetricKey, string>>;
	roundTripUs?: number;
	serializer: string;
	sizeVsJson?: number;
	status: BenchmarkStatus | "failed";
	vsJson?: number;
}

interface FlattenedCase {
	description: string;
	name: string;
	rows: BenchmarkRow[];
}

type MetricKey = "bytes" | "decodeUs" | "encodeUs" | "roundTripUs" | "sizeVsJson" | "vsJson";

const BENCHMARKS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RESULTS_PATH = join(BENCHMARKS_DIR, "results.json");
const DEFAULT_MARKDOWN_PATH = join(BENCHMARKS_DIR, "..", "BENCHMARKS.md");
const MEDALS = ["\u{1f947}", "\u{1f948}", "\u{1f949}"] as const;
const MICROSECONDS = "\u00b5s";

export function generateBenchmarkMarkdown(
	report: BenchmarkReport,
	outputPath = DEFAULT_MARKDOWN_PATH,
): void {
	writeFileSync(outputPath, renderBenchmarkMarkdown(report));
}

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
	const benchmarkCases = report.cases.map(flattenCase);
	const averageCase = buildAverageCase(benchmarkCases);
	const rowCount = benchmarkCases.reduce(
		(total, benchmarkCase) => total + benchmarkCase.rows.length,
		0,
	);
	const generatedAt = new Date(report.generatedAt).toLocaleString();
	const sections = [averageCase, ...benchmarkCases].map(renderCase).join("\n\n");

	return [
		"# Codec Benchmarks",
		"",
		`${rowCount} rows from ${report.cases.length} cases, generated ${generatedAt}.`,
		"",
		"Each serializer is tested on the same case payloads over repeated encode and decode runs, using median timings from the saved benchmark report.",
		"",
		sections,
		"",
	].join("\n");
}

function flattenCase(benchmarkCase: BenchmarkCase): FlattenedCase {
	const okResults = benchmarkCase.results.filter((result) => result.status === "ok");
	const jsonResult = okResults.find((result) => result.name === "json");
	const rows = benchmarkCase.results.map(
		(result): BenchmarkRow => ({
			bytes: result.bytes,
			decodeUs: result.decode && result.decode.medianMs * 1000,
			encodeUs: result.encode && result.encode.medianMs * 1000,
			format: result.format,
			medals: {},
			roundTripUs: result.roundTrip && result.roundTrip.medianMs * 1000,
			serializer: result.name,
			sizeVsJson: result.bytes && jsonResult?.bytes ? result.bytes / jsonResult.bytes : undefined,
			status: result.status,
			vsJson:
				result.roundTrip && jsonResult?.roundTrip
					? result.roundTrip.medianMs / jsonResult.roundTrip.medianMs
					: undefined,
		}),
	);
	const medalsBySerializer = buildMetricMedals(rows);

	return {
		description: benchmarkCase.description,
		name: benchmarkCase.name,
		rows: rows
			.map((row) => ({
				...row,
				medals: medalsBySerializer.get(row.serializer) || {},
			}))
			.sort(compareRows),
	};
}

function buildAverageCase(benchmarkCases: FlattenedCase[]): FlattenedCase {
	const rowsBySerializer = new Map<string, BenchmarkRow[]>();

	for (const benchmarkCase of benchmarkCases) {
		for (const row of benchmarkCase.rows) {
			const serializerRows = rowsBySerializer.get(row.serializer) || [];
			serializerRows.push(row);
			rowsBySerializer.set(row.serializer, serializerRows);
		}
	}

	const rows = Array.from(rowsBySerializer, ([serializer, rows]): BenchmarkRow => {
		const formatValues = new Set(rows.map((row) => row.format));
		const failedRows = rows.filter((row) => row.status !== "ok");
		const [row] = rows;

		return {
			bytes: averageValue(rows, "bytes"),
			decodeUs: averageValue(rows, "decodeUs"),
			encodeUs: averageValue(rows, "encodeUs"),
			format: formatValues.size === 1 && row ? row.format : Array.from(formatValues).join(", "),
			medals: {},
			roundTripUs: averageValue(rows, "roundTripUs"),
			serializer,
			status: failedRows.length === 0 ? "ok" : "failed",
		};
	});
	const jsonRow = rows.find((row) => row.serializer === "json");
	const normalizedRows = rows.map((row) => ({
		...row,
		sizeVsJson: divide(row.bytes, jsonRow?.bytes),
		vsJson: divide(row.roundTripUs, jsonRow?.roundTripUs),
	}));
	const medalsBySerializer = buildMetricMedals(normalizedRows);

	return {
		description: "Mean values across all benchmark cases.",
		name: "Average results",
		rows: normalizedRows
			.map((row) => ({
				...row,
				medals: medalsBySerializer.get(row.serializer) || {},
			}))
			.sort(compareRows),
	};
}

function averageValue(rows: BenchmarkRow[], key: MetricKey): number | undefined {
	const values = rows
		.map((row) => row[key])
		.filter((value): value is number => value !== undefined);

	if (values.length === 0) return undefined;
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function divide(value: number | undefined, divisor: number | undefined): number | undefined {
	if (value === undefined || divisor === undefined) return undefined;
	return value / divisor;
}

function buildMetricMedals(rows: BenchmarkRow[]): Map<string, Partial<Record<MetricKey, string>>> {
	const metrics: MetricKey[] = [
		"bytes",
		"sizeVsJson",
		"encodeUs",
		"decodeUs",
		"roundTripUs",
		"vsJson",
	];
	const medalsBySerializer = new Map<string, Partial<Record<MetricKey, string>>>();

	for (const key of metrics) {
		const rankedRows = rows
			.filter((row) => row.status === "ok" && row[key] !== undefined)
			.sort((left, right) => left[key]! - right[key]!)
			.slice(0, 3);

		rankedRows.forEach((row, index) => {
			const medals = medalsBySerializer.get(row.serializer) || {};
			medals[key] = MEDALS[index]!;
			medalsBySerializer.set(row.serializer, medals);
		});
	}

	return medalsBySerializer;
}

function compareRows(left: BenchmarkRow, right: BenchmarkRow): number {
	if (left.status !== "ok" && right.status === "ok") return 1;
	if (left.status === "ok" && right.status !== "ok") return -1;
	return (left.roundTripUs ?? Infinity) - (right.roundTripUs ?? Infinity);
}

function renderCase(benchmarkCase: FlattenedCase): string {
	return [
		`## ${escapeMarkdownText(benchmarkCase.name)}`,
		"",
		escapeMarkdownText(benchmarkCase.description),
		"",
		renderTable(benchmarkCase.rows),
	].join("\n");
}

function renderTable(rows: BenchmarkRow[]): string {
	const headers = [
		"Serializer",
		"Format",
		"Bytes",
		"Size vs JSON",
		`Encode ${MICROSECONDS}`,
		`Decode ${MICROSECONDS}`,
		`Round trip ${MICROSECONDS}`,
		"Round trip vs JSON",
	];
	const alignment = [":--", ":--", "--:", "--:", "--:", "--:", "--:", "--:"];
	const body = rows.map((row) =>
		[
			formatSerializer(row),
			row.format,
			formatMetric(row, "bytes", formatInteger),
			formatMetric(row, "sizeVsJson", formatRatio),
			formatMetric(row, "encodeUs", formatNumber),
			formatMetric(row, "decodeUs", formatNumber),
			formatMetric(row, "roundTripUs", formatNumber),
			formatMetric(row, "vsJson", formatRatio),
		]
			.map(escapeTableCell)
			.join(" | "),
	);

	return [
		`| ${headers.join(" | ")} |`,
		`| ${alignment.join(" | ")} |`,
		...body.map((row) => `| ${row} |`),
	].join("\n");
}

function formatSerializer(row: BenchmarkRow): string {
	const medal = row.medals.roundTripUs;
	return medal ? `${row.serializer} ${medal}` : row.serializer;
}

function formatMetric(
	row: BenchmarkRow,
	key: MetricKey,
	formatter: (value: number) => string,
): string {
	const value = row[key];
	if (value === undefined) return "";
	const medal = row.medals[key];
	return `${medal ? `${medal} ` : ""}${formatter(value)}`;
}

function formatInteger(value: number): string {
	return Math.round(value).toLocaleString();
}

function formatNumber(value: number): string {
	return value.toFixed(value < 10 ? 2 : 1);
}

function formatRatio(value: number): string {
	return `${value.toFixed(2)}x`;
}

function escapeMarkdownText(value: string): string {
	return value.replaceAll("\\", "\\\\");
}

function escapeTableCell(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

if (import.meta.main) {
	const report = JSON.parse(readFileSync(DEFAULT_RESULTS_PATH, "utf8")) as BenchmarkReport;
	generateBenchmarkMarkdown(report);
}
