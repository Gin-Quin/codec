import {
	type Decoder,
	type Encoder,
	ensureCapacity,
	readCachedVarString,
	readDate,
	readFloat32,
	readFloat64,
	readUint8,
	readVarBigInt,
	readVarInt,
	readVarString,
	readVarUint,
	readVarUint8Array,
	writeDate,
	writeFloat32,
	writeFloat64,
	writeUint8,
	writeVarBigInt,
	writeVarInt,
	writeVarString,
	writeVarUint,
	writeVarUint8Array,
} from "./binary";
import {
	readSchema,
	readSchemaValue,
	readUnknown,
	readUntaggedUnion,
	writeSchema,
	writeSchemaValue,
	writeUnknown,
	writeUntaggedUnion,
} from "./dynamic";
import { literalValuesEqual, type Schema } from "./schema";

type WriteFunction = (encoder: Encoder, value: any) => void;
type ReadFunction = (decoder: Decoder) => any;

interface CompileState {
	lazySchemas: Array<() => Schema>;
	literalSchemas: Array<{ value: unknown }>;
	nextId: number;
	stringCaches: Array<unknown[]>;
}

interface ReadFragment {
	expression: string;
	setup: string;
}

const compiledHelpers = {
	readDate,
	readFloat32,
	readFloat64,
	readCachedVarString,
	readSchema,
	readSchemaValue,
	readUnknown,
	readUntaggedUnion,
	readUint8,
	readVarBigInt,
	readVarInt,
	readVarString,
	readVarUint,
	readVarUint8Array,
	ensureCapacity,
	writeDate,
	writeFloat32,
	writeFloat64,
	writeSchema,
	writeSchemaValue,
	writeUnknown,
	writeUntaggedUnion,
	writeUint8,
	writeVarBigInt,
	writeVarInt,
	writeVarString,
	writeVarUint,
	writeVarUint8Array,
	literalValuesEqual,
};
const compiledHelperNames = Object.keys(compiledHelpers);
const compiledHelperDeclarations = `const {${compiledHelperNames.join(",")}} = helpers;`;

/** Compiles a schema into a low-level writer function. */
export function compileWriter(schema: Schema): WriteFunction {
	const state: CompileState = {
		lazySchemas: [],
		literalSchemas: [],
		nextId: 0,
		stringCaches: [],
	};
	const body = emitWrite(schema, "value", "encoder", state);
	return new Function(
		"helpers",
		"lazySchemas",
		"literalSchemas",
		`${compiledHelperDeclarations}return function writeCompiled(encoder, value) {${body}}`,
	)(compiledHelpers, state.lazySchemas, state.literalSchemas) as WriteFunction;
}

/** Compiles a schema into a low-level reader function. */
export function compileReader(schema: Schema): ReadFunction {
	const state: CompileState = {
		lazySchemas: [],
		literalSchemas: [],
		nextId: 0,
		stringCaches: [],
	};
	const result = emitRead(schema, "decoder", state);
	const body = `${result.setup}return ${result.expression};`;
	return new Function(
		"helpers",
		"lazySchemas",
		"literalSchemas",
		"stringCaches",
		`${compiledHelperDeclarations}return function readCompiled(decoder) {${body}}`,
	)(compiledHelpers, state.lazySchemas, state.literalSchemas, state.stringCaches) as ReadFunction;
}

function emitWrite(schema: Schema, value: string, encoder: string, state: CompileState): string {
	if (typeof schema === "function") {
		const index = state.lazySchemas.push(schema) - 1;
		return `writeSchema(lazySchemas[${index}](), ${value}, ${encoder});`;
	}

	if (typeof schema === "string") {
		switch (schema) {
			case "string":
				return `writeVarString(${encoder}, ${value});`;
			case "int":
				return `writeVarInt(${encoder}, ${value});`;
			case "uint":
				return `writeVarUint(${encoder}, ${value});`;
			case "uint8Array":
				return `writeVarUint8Array(${encoder}, ${value});`;
			case "boolean":
				return `ensureCapacity(${encoder}, 1);${encoder}.buffer[${encoder}.pos++] = ${value} ? 1 : 0;`;
			case "date":
				return `writeDate(${encoder}, ${value});`;
			case "float32":
				return `ensureCapacity(${encoder}, 4);${encoder}.view.setFloat32(${encoder}.pos, ${value}, true);${encoder}.pos += 4;`;
			case "float64":
				return `ensureCapacity(${encoder}, 8);${encoder}.view.setFloat64(${encoder}.pos, ${value}, true);${encoder}.pos += 8;`;
			case "unknown":
				return `writeUnknown(${value}, ${encoder});`;
			case "schema":
				return `writeSchemaValue(${value}, ${encoder});`;
			case "null":
			case "undefined":
				return "";
		}
	}

	switch (schema._type) {
		case "literal": {
			const index = state.literalSchemas.push(schema) - 1;
			return `if (!literalValuesEqual(${value}, literalSchemas[${index}].value)) {throw new Error("Value does not match literal schema");}`;
		}
		case "array": {
			const index = createId("index", state);
			const length = createId("length", state);
			return `writeVarUint(${encoder}, ${value}.length);for (let ${index} = 0, ${length} = ${value}.length; ${index} < ${length}; ${index}++) {${emitWrite(schema.element, `${value}[${index}]`, encoder, state)}}`;
		}
		case "object": {
			let body = "";
			for (const [key, fieldSchema] of Object.entries(schema.fields)) {
				body += emitWrite(fieldSchema, `${value}[${JSON.stringify(key)}]`, encoder, state);
			}
			return body;
		}
		case "optional":
			return `if (${value} === undefined) {writeUint8(${encoder}, 0);} else {writeUint8(${encoder}, 1);${emitWrite(schema.schema, value, encoder, state)}}`;
		case "union": {
			const discriminant = createId("discriminant", state);
			let body = `const ${discriminant} = ${value}[${JSON.stringify(schema.tagName)}];`;
			body += emitWrite(schema.type, discriminant, encoder, state);
			body += `switch (${discriminant}) {`;
			for (const [variant, variantSchema] of Object.entries(schema.variants)) {
				body += `case ${variantLiteral(schema.type, variant)}:`;
				for (const [key, fieldSchema] of Object.entries(variantSchema)) {
					if (key !== schema.tagName) {
						body += emitWrite(fieldSchema, `${value}[${JSON.stringify(key)}]`, encoder, state);
					}
				}
				body += "break;";
			}
			body += `default: throw new Error("Unknown union variant: " + ${discriminant});}`;
			return body;
		}
		case "untaggedUnion": {
			const index = state.lazySchemas.push(() => schema) - 1;
			return `writeUntaggedUnion(lazySchemas[${index}](), ${value}, ${encoder});`;
		}
		case "map": {
			const index = createId("index", state);
			const keys = createId("keys", state);
			const length = createId("length", state);
			const key = createId("key", state);
			return `const ${keys} = Object.keys(${value});const ${length} = ${keys}.length;writeVarUint(${encoder}, ${length});for (let ${index} = 0; ${index} < ${length}; ${index}++) {const ${key} = ${keys}[${index}];writeVarString(${encoder}, ${key});${emitWrite(schema.element, `${value}[${key}]`, encoder, state)}}`;
		}
		case "bigint":
			return `writeVarBigInt(${encoder}, ${value}, ${schema.maxBytes});`;
		case "set": {
			const element = createId("element", state);
			return `writeVarUint(${encoder}, ${value}.size);for (const ${element} of ${value}) {${emitWrite(schema.element, element, encoder, state)}}`;
		}
		case "tuple": {
			let body = "";
			for (let index = 0; index < schema.elements.length; index++) {
				body += emitWrite(schema.elements[index]!, `${value}[${index}]`, encoder, state);
			}
			return body;
		}
	}
}

function emitRead(schema: Schema, decoder: string, state: CompileState): ReadFragment {
	if (typeof schema === "function") {
		const index = state.lazySchemas.push(schema) - 1;
		return {
			expression: `readSchema(lazySchemas[${index}](), ${decoder})`,
			setup: "",
		};
	}

	if (typeof schema === "string") {
		switch (schema) {
			case "string":
				return { expression: `readVarString(${decoder})`, setup: "" };
			case "int":
				return { expression: `readVarInt(${decoder})`, setup: "" };
			case "uint":
				return { expression: `readVarUint(${decoder})`, setup: "" };
			case "uint8Array":
				return { expression: `readVarUint8Array(${decoder})`, setup: "" };
			case "boolean": {
				const byte = createId("byte", state);
				return {
					expression: `${byte} === 1`,
					setup: `if (${decoder}.pos >= ${decoder}.arr.length) {throw new Error("Unexpected end of array");}const ${byte} = ${decoder}.arr[${decoder}.pos++];`,
				};
			}
			case "date":
				return { expression: `readDate(${decoder})`, setup: "" };
			case "float32": {
				const pos = createId("pos", state);
				const value = createId("value", state);
				return {
					expression: value,
					setup: `const ${pos} = ${decoder}.pos;if (${pos} + 4 > ${decoder}.arr.length) {throw new Error("Unexpected end of array");}${decoder}.pos = ${pos} + 4;const ${value} = ${decoder}.view.getFloat32(${pos}, true);`,
				};
			}
			case "float64": {
				const pos = createId("pos", state);
				const value = createId("value", state);
				return {
					expression: value,
					setup: `const ${pos} = ${decoder}.pos;if (${pos} + 8 > ${decoder}.arr.length) {throw new Error("Unexpected end of array");}${decoder}.pos = ${pos} + 8;const ${value} = ${decoder}.view.getFloat64(${pos}, true);`,
				};
			}
			case "unknown":
				return { expression: `readUnknown(${decoder})`, setup: "" };
			case "schema":
				return { expression: `readSchemaValue(${decoder})`, setup: "" };
			case "null":
				return { expression: "null", setup: "" };
			case "undefined":
				return { expression: "undefined", setup: "" };
		}
	}

	switch (schema._type) {
		case "literal": {
			const index = state.literalSchemas.push(schema) - 1;
			return { expression: `literalSchemas[${index}].value`, setup: "" };
		}
		case "array": {
			const length = createId("length", state);
			const index = createId("index", state);
			const result = createId("result", state);
			const element = emitRead(schema.element, decoder, state);
			return {
				expression: result,
				setup: `const ${length} = readVarUint(${decoder});const ${result} = new Array(${length});for (let ${index} = 0; ${index} < ${length}; ${index}++) {${element.setup}${result}[${index}] = ${element.expression};}`,
			};
		}
		case "object": {
			const result = createId("result", state);
			let body = "";
			const fields: string[] = [];
			for (const [key, fieldSchema] of Object.entries(schema.fields)) {
				const field = emitRead(fieldSchema, decoder, state);
				const fieldValue = createId("field", state);
				body += `${field.setup}const ${fieldValue} = ${field.expression};`;
				fields.push(`${JSON.stringify(key)}:${fieldValue}`);
			}
			body += `const ${result} = {${fields.join(",")}};`;
			return { expression: result, setup: body };
		}
		case "optional": {
			const result = createId("result", state);
			const value = emitRead(schema.schema, decoder, state);
			return {
				expression: result,
				setup: `let ${result};if (readUint8(${decoder}) === 0) {${result} = undefined;} else {${value.setup}${result} = ${value.expression};}`,
			};
		}
		case "union": {
			const discriminant = createId("discriminant", state);
			const discriminantValue = emitRead(schema.type, decoder, state);
			const result = createId("result", state);
			let body = `${discriminantValue.setup}const ${discriminant} = ${discriminantValue.expression};let ${result};switch (${discriminant}) {`;
			for (const [variant, variantSchema] of Object.entries(schema.variants)) {
				const variantResult = createId("result", state);
				body += `case ${variantLiteral(schema.type, variant)}:{const ${variantResult} = {${JSON.stringify(schema.tagName)}: ${discriminant}};`;
				for (const [key, fieldSchema] of Object.entries(variantSchema)) {
					if (key !== schema.tagName) {
						const field = emitRead(fieldSchema, decoder, state);
						body += `${field.setup}${variantResult}[${JSON.stringify(key)}] = ${field.expression};`;
					}
				}
				body += `${result} = ${variantResult};break;}`;
			}
			body += `default: throw new Error("Unknown union variant: " + ${discriminant});}`;
			return { expression: result, setup: body };
		}
		case "untaggedUnion": {
			const index = state.lazySchemas.push(() => schema) - 1;
			return {
				expression: `readUntaggedUnion(lazySchemas[${index}](), ${decoder})`,
				setup: "",
			};
		}
		case "map": {
			const cacheIndex = state.stringCaches.push([]) - 1;
			const length = createId("length", state);
			const index = createId("index", state);
			const key = createId("key", state);
			const result = createId("result", state);
			const element = emitRead(schema.element, decoder, state);
			return {
				expression: result,
				setup: `const ${length} = readVarUint(${decoder});const ${result} = {};for (let ${index} = 0; ${index} < ${length}; ${index}++) {const ${key} = readCachedVarString(${decoder}, stringCaches[${cacheIndex}], ${index});${element.setup}${result}[${key}] = ${element.expression};}`,
			};
		}
		case "bigint":
			return { expression: `readVarBigInt(${decoder}, ${schema.maxBytes})`, setup: "" };
		case "set": {
			const length = createId("length", state);
			const index = createId("index", state);
			const result = createId("result", state);
			const element = emitRead(schema.element, decoder, state);
			return {
				expression: result,
				setup: `const ${length} = readVarUint(${decoder});const ${result} = new Set();for (let ${index} = 0; ${index} < ${length}; ${index}++) {${element.setup}${result}.add(${element.expression});}`,
			};
		}
		case "tuple": {
			const result = createId("result", state);
			let body = `const ${result} = new Array(${schema.elements.length});`;
			for (let index = 0; index < schema.elements.length; index++) {
				const element = emitRead(schema.elements[index]!, decoder, state);
				body += `${element.setup}${result}[${index}] = ${element.expression};`;
			}
			return { expression: result, setup: body };
		}
	}
}

function createId(prefix: string, state: CompileState): string {
	return `${prefix}${state.nextId++}`;
}

function variantLiteral(type: "string" | "int" | "uint", variant: string): string {
	return type === "string" ? JSON.stringify(variant) : String(Number(variant));
}
