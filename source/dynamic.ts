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
	UnionDiscriminantType,
	UnionSchema,
	UntaggedUnionSchema,
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
			case "untaggedUnion":
				writeUntaggedUnion(schema, value, encoder);
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
	schema: UnionSchema<
		UnionDiscriminantType,
		Record<string | number, Record<string, Schema>>,
		string
	>,
	value: any,
	encoder: Encoder,
): void {
	const discriminantValue = value[schema.tagName];

	writeSchema(schema.type, discriminantValue, encoder);

	const variantSchema = schema.variants[discriminantValue];
	if (!variantSchema) {
		throw new Error(`Unknown union variant: ${discriminantValue}`);
	}

	for (const [key, fieldSchema] of Object.entries(variantSchema)) {
		if (key !== schema.tagName) {
			writeSchema(fieldSchema, value[key], encoder);
		}
	}
}

export function writeUntaggedUnion(
	schema: UntaggedUnionSchema<readonly Schema[]>,
	value: any,
	encoder: Encoder,
): void {
	const variantIndex = findUntaggedUnionVariant(schema.variants, value);
	if (variantIndex === -1) {
		throw new Error("No matching union variant");
	}

	writeVarUint(encoder, variantIndex);
	writeSchema(schema.variants[variantIndex]!, value, encoder);
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
		case "untaggedUnion":
			return readUntaggedUnion(schema, decoder);
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
	schema: UnionSchema<
		UnionDiscriminantType,
		Record<string | number, Record<string, Schema>>,
		string
	>,
	decoder: Decoder,
): any {
	const discriminantValue = readPrimitive(schema.type, decoder);

	const variantSchema = schema.variants[discriminantValue];
	if (!variantSchema) {
		throw new Error(`Unknown union variant: ${discriminantValue}`);
	}

	const result: any = {
		[schema.tagName]: discriminantValue,
	};

	for (const [key, fieldSchema] of Object.entries(variantSchema)) {
		if (key !== schema.tagName) {
			result[key] = readSchema(fieldSchema, decoder);
		}
	}

	return result;
}

export function readUntaggedUnion(
	schema: UntaggedUnionSchema<readonly Schema[]>,
	decoder: Decoder,
): any {
	const variantIndex = readVarUint(decoder);
	const variantSchema = schema.variants[variantIndex];
	if (!variantSchema) {
		throw new Error(`Unknown union variant: ${variantIndex}`);
	}

	return readSchema(variantSchema, decoder);
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

function findUntaggedUnionVariant(variants: readonly Schema[], value: any): number {
	for (let index = 0; index < variants.length; index++) {
		if (matchesSchema(variants[index]!, value)) {
			return index;
		}
	}

	return -1;
}

function matchesSchema(schema: Schema, value: any): boolean {
	if (typeof schema === "function") {
		return matchesSchema(schema(), value);
	}

	if (typeof schema === "string") {
		return matchesPrimitive(schema, value);
	}

	switch (schema._type) {
		case "array":
			if (!Array.isArray(value)) {
				return false;
			}

			for (const element of value) {
				if (!matchesSchema(schema.element, element)) {
					return false;
				}
			}

			return true;
		case "object":
			if (!isRecordValue(value)) {
				return false;
			}

			for (const [key, fieldSchema] of Object.entries(schema.fields)) {
				if (!matchesSchema(fieldSchema, value[key])) {
					return false;
				}
			}

			return true;
		case "optional":
			return value === undefined || matchesSchema(schema.schema, value);
		case "union":
			return matchesTaggedUnionSchema(schema, value);
		case "untaggedUnion":
			return findUntaggedUnionVariant(schema.variants, value) !== -1;
		case "map":
			if (!isRecordValue(value)) {
				return false;
			}

			for (const element of Object.values(value)) {
				if (!matchesSchema(schema.element, element)) {
					return false;
				}
			}

			return true;
		case "bigint":
			return typeof value === "bigint";
		case "set":
			if (!(value instanceof Set)) {
				return false;
			}

			for (const element of value) {
				if (!matchesSchema(schema.element, element)) {
					return false;
				}
			}

			return true;
		case "tuple":
			if (!Array.isArray(value) || value.length !== schema.elements.length) {
				return false;
			}

			for (let index = 0; index < schema.elements.length; index++) {
				if (!matchesSchema(schema.elements[index]!, value[index])) {
					return false;
				}
			}

			return true;
	}
}

function matchesPrimitive(schema: PrimitiveType, value: any): boolean {
	switch (schema) {
		case "string":
			return typeof value === "string";
		case "int":
			return Number.isSafeInteger(value);
		case "uint":
			return Number.isSafeInteger(value) && value >= 0;
		case "uint8Array":
			return value instanceof Uint8Array;
		case "boolean":
			return typeof value === "boolean";
		case "date":
			return value instanceof Date;
		case "float32":
		case "float64":
			return typeof value === "number";
	}
}

function matchesTaggedUnionSchema(
	schema: UnionSchema<
		UnionDiscriminantType,
		Record<string | number, Record<string, Schema>>,
		string
	>,
	value: any,
): boolean {
	if (!isRecordValue(value)) {
		return false;
	}

	const variantSchema = schema.variants[value[schema.tagName]];
	if (!variantSchema) {
		return false;
	}

	for (const [key, fieldSchema] of Object.entries(variantSchema)) {
		if (key !== schema.tagName && !matchesSchema(fieldSchema, value[key])) {
			return false;
		}
	}

	return true;
}

function isRecordValue(value: any): value is Record<string, any> {
	return (
		value !== null &&
		typeof value === "object" &&
		!Array.isArray(value) &&
		!(value instanceof Date) &&
		!(value instanceof Set) &&
		!(value instanceof Uint8Array)
	);
}
