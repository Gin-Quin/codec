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
import {
	type ArraySchema,
	type BigIntSchema,
	bigint as bigintSchema,
	isSchema,
	type MapSchema,
	type ObjectSchema,
	type OptionalSchema,
	type PrimitiveType,
	type Schema,
	type SetSchema,
	schemaOf,
	type TupleSchema,
	type UnionDiscriminantType,
	type UnionSchema,
	type UntaggedUnionSchema,
} from "./schema";

enum SchemaTag {
	String = 0,
	Int = 1,
	Uint = 2,
	Uint8Array = 3,
	Boolean = 4,
	Date = 5,
	Float32 = 6,
	Float64 = 7,
	BigInt = 8,
	Array = 9,
	Object = 10,
	Optional = 11,
	Union = 12,
	UntaggedUnion = 13,
	Map = 14,
	Set = 15,
	Tuple = 16,
	Unknown = 17,
	Schema = 18,
	Null = 19,
	Undefined = 20,
}

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
			case "unknown":
				writeUnknown(value, encoder);
				break;
			case "schema":
				writeSchemaValue(value, encoder);
				break;
			case "null":
			case "undefined":
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

/** Writes a concrete schema value. */
export function writeSchemaValue(schema: Schema, encoder: Encoder): void {
	if (typeof schema === "function") {
		throw new Error("Cannot encode lazy schema functions");
	}

	if (typeof schema === "string") {
		writePrimitiveSchemaValue(schema, encoder);
		return;
	}

	if (typeof schema !== "object" || schema === null) {
		throw new Error("Cannot encode invalid schema");
	}

	switch (schema._type) {
		case "array":
			writeUint8(encoder, SchemaTag.Array);
			writeSchemaValue(schema.element, encoder);
			break;
		case "object":
			writeUint8(encoder, SchemaTag.Object);
			writeSchemaFields(schema.fields, encoder);
			break;
		case "optional":
			writeUint8(encoder, SchemaTag.Optional);
			writeSchemaValue(schema.schema, encoder);
			break;
		case "union": {
			writeUint8(encoder, SchemaTag.Union);
			writeVarString(encoder, schema.tagName);
			writeSchemaValue(schema.type, encoder);
			const variantKeys = Object.keys(schema.variants);
			writeVarUint(encoder, variantKeys.length);
			for (let index = 0; index < variantKeys.length; index++) {
				const variant = variantKeys[index]!;
				writeVarString(encoder, variant);
				writeSchemaFields(schema.variants[variant]!, encoder);
			}
			break;
		}
		case "untaggedUnion":
			writeUint8(encoder, SchemaTag.UntaggedUnion);
			writeVarUint(encoder, schema.variants.length);
			for (const variant of schema.variants) {
				writeSchemaValue(variant, encoder);
			}
			break;
		case "map":
			writeUint8(encoder, SchemaTag.Map);
			writeSchemaValue(schema.element, encoder);
			break;
		case "bigint":
			writeUint8(encoder, SchemaTag.BigInt);
			writeVarUint(encoder, schema.maxBytes);
			break;
		case "set":
			writeUint8(encoder, SchemaTag.Set);
			writeSchemaValue(schema.element, encoder);
			break;
		case "tuple":
			writeUint8(encoder, SchemaTag.Tuple);
			writeVarUint(encoder, schema.elements.length);
			for (const element of schema.elements) {
				writeSchemaValue(element, encoder);
			}
			break;
		default:
			throw new Error(`Unknown schema type: ${String((schema as { _type?: unknown })._type)}`);
	}
}

function writePrimitiveSchemaValue(schema: PrimitiveType, encoder: Encoder): void {
	switch (schema) {
		case "string":
			writeUint8(encoder, SchemaTag.String);
			break;
		case "int":
			writeUint8(encoder, SchemaTag.Int);
			break;
		case "uint":
			writeUint8(encoder, SchemaTag.Uint);
			break;
		case "uint8Array":
			writeUint8(encoder, SchemaTag.Uint8Array);
			break;
		case "boolean":
			writeUint8(encoder, SchemaTag.Boolean);
			break;
		case "date":
			writeUint8(encoder, SchemaTag.Date);
			break;
		case "float32":
			writeUint8(encoder, SchemaTag.Float32);
			break;
		case "float64":
			writeUint8(encoder, SchemaTag.Float64);
			break;
		case "unknown":
			writeUint8(encoder, SchemaTag.Unknown);
			break;
		case "schema":
			writeUint8(encoder, SchemaTag.Schema);
			break;
		case "null":
			writeUint8(encoder, SchemaTag.Null);
			break;
		case "undefined":
			writeUint8(encoder, SchemaTag.Undefined);
			break;
		default:
			throw new Error(`Unknown primitive schema: ${String(schema)}`);
	}
}

function writeSchemaFields(fields: Record<string, Schema>, encoder: Encoder): void {
	const keys = Object.keys(fields);
	writeVarUint(encoder, keys.length);
	for (let index = 0; index < keys.length; index++) {
		const key = keys[index]!;
		writeVarString(encoder, key);
		writeSchemaValue(fields[key]!, encoder);
	}
}

/** Reads a concrete schema value. */
export function readSchemaValue(decoder: Decoder): Schema {
	const tag = readUint8(decoder);
	switch (tag) {
		case SchemaTag.String:
			return "string";
		case SchemaTag.Int:
			return "int";
		case SchemaTag.Uint:
			return "uint";
		case SchemaTag.Uint8Array:
			return "uint8Array";
		case SchemaTag.Boolean:
			return "boolean";
		case SchemaTag.Date:
			return "date";
		case SchemaTag.Float32:
			return "float32";
		case SchemaTag.Float64:
			return "float64";
		case SchemaTag.BigInt:
			return bigintSchema(readVarUint(decoder));
		case SchemaTag.Array:
			return { _type: "array", element: readSchemaValue(decoder) };
		case SchemaTag.Object:
			return { _type: "object", fields: readSchemaFields(decoder) };
		case SchemaTag.Optional:
			return { _type: "optional", schema: readSchemaValue(decoder) };
		case SchemaTag.Union:
			return readUnionSchemaValue(decoder);
		case SchemaTag.UntaggedUnion:
			return readUntaggedUnionSchemaValue(decoder);
		case SchemaTag.Map:
			return { _type: "map", element: readSchemaValue(decoder) };
		case SchemaTag.Set:
			return { _type: "set", element: readSchemaValue(decoder) };
		case SchemaTag.Tuple:
			return readTupleSchemaValue(decoder);
		case SchemaTag.Unknown:
			return "unknown";
		case SchemaTag.Schema:
			return "schema";
		case SchemaTag.Null:
			return "null";
		case SchemaTag.Undefined:
			return "undefined";
		default:
			throw new Error(`Unknown schema tag: ${tag}`);
	}
}

function readSchemaFields(decoder: Decoder): Record<string, Schema> {
	const length = readVarUint(decoder);
	const fields: Record<string, Schema> = {};
	for (let index = 0; index < length; index++) {
		fields[readVarString(decoder)] = readSchemaValue(decoder);
	}
	return fields;
}

function readUnionSchemaValue(
	decoder: Decoder,
): UnionSchema<UnionDiscriminantType, Record<string | number, Record<string, Schema>>, string> {
	const tagName = readVarString(decoder);
	const type = readUnionDiscriminantSchemaValue(decoder);
	const length = readVarUint(decoder);
	const variants: Record<string, Record<string, Schema>> = {};
	for (let index = 0; index < length; index++) {
		variants[readVarString(decoder)] = readSchemaFields(decoder);
	}

	return { _type: "union", tagName, type, variants };
}

function readUnionDiscriminantSchemaValue(decoder: Decoder): UnionDiscriminantType {
	const schema = readSchemaValue(decoder);
	if (schema === "string" || schema === "int" || schema === "uint") {
		return schema;
	}

	throw new Error("Invalid union discriminant schema");
}

function readUntaggedUnionSchemaValue(decoder: Decoder): UntaggedUnionSchema<Schema[]> {
	const length = readVarUint(decoder);
	const variants: Schema[] = new Array(length);
	for (let index = 0; index < length; index++) {
		variants[index] = readSchemaValue(decoder);
	}
	return { _type: "untaggedUnion", variants };
}

function readTupleSchemaValue(decoder: Decoder): TupleSchema<Schema[]> {
	const length = readVarUint(decoder);
	const elements: Schema[] = new Array(length);
	for (let index = 0; index < length; index++) {
		elements[index] = readSchemaValue(decoder);
	}
	return { _type: "tuple", elements };
}

/** Writes a value prefixed by a discovered schema for that value. */
export function writeUnknown(value: unknown, encoder: Encoder): void {
	const discoveredSchema = schemaOf(value);
	writeSchemaValue(discoveredSchema, encoder);
	writeSchema(discoveredSchema, value, encoder);
}

/** Reads a value prefixed by its schema. */
export function readUnknown(decoder: Decoder): unknown {
	return readSchema(readSchemaValue(decoder), decoder);
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
		case "unknown":
			return readUnknown(decoder);
		case "schema":
			return readSchemaValue(decoder);
		case "null":
			return null;
		case "undefined":
			return undefined;
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
		case "unknown":
			return true;
		case "schema":
			return isSchema(value);
		case "null":
			return value === null;
		case "undefined":
			return value === undefined;
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
