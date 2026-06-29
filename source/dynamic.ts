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
import type {
	ArraySchema,
	BigIntSchema,
	MapSchema,
	ObjectSchema,
	OptionalSchema,
	PrimitiveType,
	Schema,
	SetSchema,
	TupleSchema,
	UnionSchema,
} from "./schema";

/** Writes a value using a schema without precompiling a codec. */
export function writeSchema(schema: Schema, value: any, encoder: Encoder): void {
	if (typeof schema === "function") {
		schema = schema();
	}

	if (typeof schema === "string") {
		switch (schema) {
			case "string":
				writeVarString(encoder, value);
				break;
			case "int":
				writeVarInt(encoder, value);
				break;
			case "uint":
				writeVarUint(encoder, value);
				break;
			case "uint8Array":
				writeVarUint8Array(encoder, value);
				break;
			case "boolean":
				writeUint8(encoder, value ? 1 : 0);
				break;
			case "date":
				writeDate(encoder, value);
				break;
			case "float32":
				writeFloat32(encoder, value);
				break;
			case "float64":
				writeFloat64(encoder, value);
				break;
		}
	} else {
		switch (schema._type) {
			case "array":
				writeArray(schema, value, encoder);
				break;
			case "object":
				writeObject(schema, value, encoder);
				break;
			case "optional":
				writeOptional(schema, value, encoder);
				break;
			case "union":
				writeUnion(schema, value, encoder);
				break;
			case "map":
				writeMap(schema, value, encoder);
				break;
			case "bigint":
				writeBigInt(schema, value, encoder);
				break;
			case "set":
				writeSet(schema, value, encoder);
				break;
			case "tuple":
				writeTuple(schema, value, encoder);
				break;
		}
	}
}

function writeArray(schema: ArraySchema<Schema>, value: any[], encoder: Encoder): void {
	writeVarUint(encoder, value.length);
	for (let index = 0; index < value.length; index++) {
		writeSchema(schema.element, value[index], encoder);
	}
}

function writeObject(
	schema: ObjectSchema<Record<string, Schema>>,
	value: any,
	encoder: Encoder,
): void {
	for (const [key, fieldSchema] of Object.entries(schema.fields)) {
		writeSchema(fieldSchema, value[key], encoder);
	}
}

function writeOptional(
	schema: OptionalSchema<Schema>,
	value: any | undefined,
	encoder: Encoder,
): void {
	if (value === undefined) {
		writeUint8(encoder, 0);
	} else {
		writeUint8(encoder, 1);
		writeSchema(schema.schema, value, encoder);
	}
}

function writeUnion(
	schema: UnionSchema<string, Record<string, Record<string, Schema>>>,
	value: any,
	encoder: Encoder,
): void {
	const discriminantValue = value[schema.discriminant];

	writeSchema(schema.type, discriminantValue, encoder);

	const variantSchema = schema.variants[discriminantValue];
	if (!variantSchema) {
		throw new Error(`Unknown union variant: ${discriminantValue}`);
	}

	for (const [key, fieldSchema] of Object.entries(variantSchema)) {
		if (key !== schema.discriminant) {
			writeSchema(fieldSchema, value[key], encoder);
		}
	}
}

function writeMap(schema: MapSchema<Schema>, value: any, encoder: Encoder): void {
	const entries = Object.entries(value);
	writeVarUint(encoder, entries.length);
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index]!;
		writeVarString(encoder, entry[0]);
		writeSchema(schema.element, entry[1], encoder);
	}
}

function writeBigInt(schema: BigIntSchema, value: bigint, encoder: Encoder): void {
	writeVarBigInt(encoder, value, schema.maxBytes);
}

function writeSet(schema: SetSchema<Schema>, value: Set<any>, encoder: Encoder): void {
	writeVarUint(encoder, value.size);
	for (const element of value) {
		writeSchema(schema.element, element, encoder);
	}
}

function writeTuple(schema: TupleSchema<Schema[]>, value: any[], encoder: Encoder): void {
	for (let index = 0; index < schema.elements.length; index++) {
		writeSchema(schema.elements[index]!, value[index], encoder);
	}
}

/** Reads a value using a schema without precompiling a codec. */
export function readSchema(schema: Schema, decoder: Decoder): any {
	if (typeof schema === "function") {
		schema = schema();
	}

	if (typeof schema === "string") {
		return readPrimitive(schema, decoder);
	}

	switch (schema._type) {
		case "array":
			return readArray(schema, decoder);
		case "object":
			return readObject(schema, decoder);
		case "optional":
			return readOptional(schema, decoder);
		case "union":
			return readUnion(schema, decoder);
		case "map":
			return readMap(schema, decoder);
		case "bigint":
			return readBigInt(schema, decoder);
		case "set":
			return readSet(schema, decoder);
		case "tuple":
			return readTuple(schema, decoder);
	}
}

function readPrimitive<P extends PrimitiveType>(type: P, decoder: Decoder): any {
	switch (type) {
		case "string":
			return readVarString(decoder);
		case "int":
			return readVarInt(decoder);
		case "uint":
			return readVarUint(decoder);
		case "uint8Array":
			return readVarUint8Array(decoder);
		case "boolean":
			return readUint8(decoder) === 1;
		case "date":
			return readDate(decoder);
		case "float32":
			return readFloat32(decoder);
		case "float64":
			return readFloat64(decoder);
	}
}

function readArray(schema: ArraySchema<Schema>, decoder: Decoder): any[] {
	const length = readVarUint(decoder);
	const result = new Array(length);
	for (let index = 0; index < length; index++) {
		result[index] = readSchema(schema.element, decoder);
	}
	return result;
}

function readObject(schema: ObjectSchema<Record<string, Schema>>, decoder: Decoder): any {
	const result: any = {};
	for (const [key, fieldSchema] of Object.entries(schema.fields)) {
		result[key] = readSchema(fieldSchema, decoder);
	}
	return result;
}

function readOptional(schema: OptionalSchema<Schema>, decoder: Decoder): any | undefined {
	if (readUint8(decoder) === 0) {
		return undefined;
	}
	return readSchema(schema.schema, decoder);
}

function readUnion(
	schema: UnionSchema<string, Record<string, Record<string, Schema>>>,
	decoder: Decoder,
): any {
	const discriminantValue = readPrimitive(schema.type, decoder);

	const variantSchema = schema.variants[discriminantValue];
	if (!variantSchema) {
		throw new Error(`Unknown union variant: ${discriminantValue}`);
	}

	const result: any = {
		[schema.discriminant]: discriminantValue,
	};

	for (const [key, fieldSchema] of Object.entries(variantSchema)) {
		if (key !== schema.discriminant) {
			result[key] = readSchema(fieldSchema, decoder);
		}
	}

	return result;
}

function readMap(schema: MapSchema<Schema>, decoder: Decoder): any {
	const length = readVarUint(decoder);
	const result: Record<string, any> = {};
	for (let index = 0; index < length; index++) {
		const key = readVarString(decoder);
		result[key] = readSchema(schema.element, decoder);
	}
	return result;
}

function readBigInt(schema: BigIntSchema, decoder: Decoder): bigint {
	return readVarBigInt(decoder, schema.maxBytes);
}

function readSet(schema: SetSchema<Schema>, decoder: Decoder): Set<any> {
	const length = readVarUint(decoder);
	const result = new Set<any>();
	for (let index = 0; index < length; index++) {
		result.add(readSchema(schema.element, decoder));
	}
	return result;
}

function readTuple(schema: TupleSchema<Schema[]>, decoder: Decoder): any[] {
	const result = new Array(schema.elements.length);
	for (let index = 0; index < schema.elements.length; index++) {
		result[index] = readSchema(schema.elements[index]!, decoder);
	}
	return result;
}
