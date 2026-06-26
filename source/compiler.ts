import {
	type Decoder,
	type Encoder,
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
import { readSchema, writeSchema } from "./dynamic";
import type { Schema } from "./schema";

type WriteFunction = (encoder: Encoder, value: any) => void;
type ReadFunction = (decoder: Decoder) => any;

interface CompileState {
	lazySchemas: Array<() => Schema>;
	nextId: number;
}

interface ReadFragment {
	expression: string;
	setup: string;
}

const compiledHelpers = {
	readDate,
	readFloat32,
	readFloat64,
	readSchema,
	readUint8,
	readVarBigInt,
	readVarInt,
	readVarString,
	readVarUint,
	readVarUint8Array,
	writeDate,
	writeFloat32,
	writeFloat64,
	writeSchema,
	writeUint8,
	writeVarBigInt,
	writeVarInt,
	writeVarString,
	writeVarUint,
	writeVarUint8Array,
};

export function compileWriter(schema: Schema): WriteFunction {
	const state: CompileState = { lazySchemas: [], nextId: 0 };
	const body = emitWrite(schema, "value", "encoder", state);
	return new Function(
		"helpers",
		"lazySchemas",
		`return function writeCompiled(encoder, value) {${body}}`,
	)(compiledHelpers, state.lazySchemas) as WriteFunction;
}

export function compileReader(schema: Schema): ReadFunction {
	const state: CompileState = { lazySchemas: [], nextId: 0 };
	const result = emitRead(schema, "decoder", state);
	const body = `${result.setup}return ${result.expression};`;
	return new Function("helpers", "lazySchemas", `return function readCompiled(decoder) {${body}}`)(
		compiledHelpers,
		state.lazySchemas,
	) as ReadFunction;
}

function emitWrite(schema: Schema, value: string, encoder: string, state: CompileState): string {
	if (typeof schema === "function") {
		const index = state.lazySchemas.push(schema) - 1;
		return `helpers.writeSchema(lazySchemas[${index}](), ${value}, ${encoder});`;
	}

	if (typeof schema === "string") {
		switch (schema) {
			case "string":
				return `helpers.writeVarString(${encoder}, ${value});`;
			case "int":
				return `helpers.writeVarInt(${encoder}, ${value});`;
			case "uint":
				return `helpers.writeVarUint(${encoder}, ${value});`;
			case "uint8Array":
				return `helpers.writeVarUint8Array(${encoder}, ${value});`;
			case "boolean":
				return `helpers.writeUint8(${encoder}, ${value} ? 1 : 0);`;
			case "date":
				return `helpers.writeDate(${encoder}, ${value});`;
			case "float32":
				return `helpers.writeFloat32(${encoder}, ${value});`;
			case "float64":
				return `helpers.writeFloat64(${encoder}, ${value});`;
		}
	}

	switch (schema._type) {
		case "array": {
			const index = createId("index", state);
			const length = createId("length", state);
			return `helpers.writeVarUint(${encoder}, ${value}.length);for (let ${index} = 0, ${length} = ${value}.length; ${index} < ${length}; ${index}++) {${emitWrite(schema.element, `${value}[${index}]`, encoder, state)}}`;
		}
		case "object": {
			let body = "";
			for (const [key, fieldSchema] of Object.entries(schema.fields)) {
				body += emitWrite(fieldSchema, `${value}[${JSON.stringify(key)}]`, encoder, state);
			}
			return body;
		}
		case "optional":
			return `if (${value} === undefined) {helpers.writeUint8(${encoder}, 0);} else {helpers.writeUint8(${encoder}, 1);${emitWrite(schema.schema, value, encoder, state)}}`;
		case "union": {
			const discriminant = createId("discriminant", state);
			let body = `const ${discriminant} = ${value}[${JSON.stringify(schema.discriminant)}];`;
			body += emitWrite(schema.type, discriminant, encoder, state);
			body += `switch (${discriminant}) {`;
			for (const [variant, variantSchema] of Object.entries(schema.variants)) {
				body += `case ${variantLiteral(schema.type, variant)}:`;
				for (const [key, fieldSchema] of Object.entries(variantSchema)) {
					if (key !== schema.discriminant) {
						body += emitWrite(fieldSchema, `${value}[${JSON.stringify(key)}]`, encoder, state);
					}
				}
				body += "break;";
			}
			body += `default: throw new Error("Unknown union variant: " + ${discriminant});}`;
			return body;
		}
		case "map": {
			const index = createId("index", state);
			const keys = createId("keys", state);
			const key = createId("key", state);
			return `const ${keys} = Object.keys(${value});helpers.writeVarUint(${encoder}, ${keys}.length);for (let ${index} = 0; ${index} < ${keys}.length; ${index}++) {const ${key} = ${keys}[${index}];helpers.writeVarString(${encoder}, ${key});${emitWrite(schema.element, `${value}[${key}]`, encoder, state)}}`;
		}
		case "bigint":
			return `helpers.writeVarBigInt(${encoder}, ${value}, ${schema.maxBytes});`;
		case "set": {
			const element = createId("element", state);
			return `helpers.writeVarUint(${encoder}, ${value}.size);for (const ${element} of ${value}) {${emitWrite(schema.element, element, encoder, state)}}`;
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
			expression: `helpers.readSchema(lazySchemas[${index}](), ${decoder})`,
			setup: "",
		};
	}

	if (typeof schema === "string") {
		switch (schema) {
			case "string":
				return { expression: `helpers.readVarString(${decoder})`, setup: "" };
			case "int":
				return { expression: `helpers.readVarInt(${decoder})`, setup: "" };
			case "uint":
				return { expression: `helpers.readVarUint(${decoder})`, setup: "" };
			case "uint8Array":
				return { expression: `helpers.readVarUint8Array(${decoder})`, setup: "" };
			case "boolean":
				return { expression: `helpers.readUint8(${decoder}) === 1`, setup: "" };
			case "date":
				return { expression: `helpers.readDate(${decoder})`, setup: "" };
			case "float32":
				return { expression: `helpers.readFloat32(${decoder})`, setup: "" };
			case "float64":
				return { expression: `helpers.readFloat64(${decoder})`, setup: "" };
		}
	}

	switch (schema._type) {
		case "array": {
			const length = createId("length", state);
			const index = createId("index", state);
			const result = createId("result", state);
			const element = emitRead(schema.element, decoder, state);
			return {
				expression: result,
				setup: `const ${length} = helpers.readVarUint(${decoder});const ${result} = new Array(${length});for (let ${index} = 0; ${index} < ${length}; ${index}++) {${element.setup}${result}[${index}] = ${element.expression};}`,
			};
		}
		case "object": {
			const result = createId("result", state);
			let body = `const ${result} = {};`;
			for (const [key, fieldSchema] of Object.entries(schema.fields)) {
				const field = emitRead(fieldSchema, decoder, state);
				body += `${field.setup}${result}[${JSON.stringify(key)}] = ${field.expression};`;
			}
			return { expression: result, setup: body };
		}
		case "optional": {
			const result = createId("result", state);
			const value = emitRead(schema.schema, decoder, state);
			return {
				expression: result,
				setup: `let ${result};if (helpers.readUint8(${decoder}) === 0) {${result} = undefined;} else {${value.setup}${result} = ${value.expression};}`,
			};
		}
		case "union": {
			const discriminant = createId("discriminant", state);
			const discriminantValue = emitRead(schema.type, decoder, state);
			const result = createId("result", state);
			let body = `${discriminantValue.setup}const ${discriminant} = ${discriminantValue.expression};let ${result};switch (${discriminant}) {`;
			for (const [variant, variantSchema] of Object.entries(schema.variants)) {
				const variantResult = createId("result", state);
				body += `case ${variantLiteral(schema.type, variant)}:{const ${variantResult} = {${JSON.stringify(schema.discriminant)}: ${discriminant}};`;
				for (const [key, fieldSchema] of Object.entries(variantSchema)) {
					if (key !== schema.discriminant) {
						const field = emitRead(fieldSchema, decoder, state);
						body += `${field.setup}${variantResult}[${JSON.stringify(key)}] = ${field.expression};`;
					}
				}
				body += `${result} = ${variantResult};break;}`;
			}
			body += `default: throw new Error("Unknown union variant: " + ${discriminant});}`;
			return { expression: result, setup: body };
		}
		case "map": {
			const length = createId("length", state);
			const index = createId("index", state);
			const key = createId("key", state);
			const result = createId("result", state);
			const element = emitRead(schema.element, decoder, state);
			return {
				expression: result,
				setup: `const ${length} = helpers.readVarUint(${decoder});const ${result} = {};for (let ${index} = 0; ${index} < ${length}; ${index}++) {const ${key} = helpers.readVarString(${decoder});${element.setup}${result}[${key}] = ${element.expression};}`,
			};
		}
		case "bigint":
			return { expression: `helpers.readVarBigInt(${decoder}, ${schema.maxBytes})`, setup: "" };
		case "set": {
			const length = createId("length", state);
			const index = createId("index", state);
			const result = createId("result", state);
			const element = emitRead(schema.element, decoder, state);
			return {
				expression: result,
				setup: `const ${length} = helpers.readVarUint(${decoder});const ${result} = new Set();for (let ${index} = 0; ${index} < ${length}; ${index}++) {${element.setup}${result}.add(${element.expression});}`,
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
