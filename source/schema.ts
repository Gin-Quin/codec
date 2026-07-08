/** Primitive schema names supported by codec. */
export type PrimitiveType =
	| "string"
	| "int"
	| "int32"
	| "int64"
	| "uint"
	| "uint32"
	| "uint64"
	| "uint8Array"
	| "boolean"
	| "date"
	| "float32"
	| "float64"
	| "unknown"
	| "schema"
	| "null"
	| "undefined";

/** Primitive schemas that can encode a union variant discriminant. */
export type IntegerPrimitiveType = "int" | "uint" | "int32" | "uint32" | "int64" | "uint64";

/** Primitive schemas that can encode a union variant discriminant. */
export type UnionDiscriminantType = "string" | IntegerPrimitiveType;

type UnionVariantMap = Record<string | number, Record<string, Schema>>;

type NumericUnionVariantKey = number | `${number}`;

type UnionVariantKeyCheck<
	DiscriminantType extends UnionDiscriminantType,
	Variants extends UnionVariantMap,
> = DiscriminantType extends "string"
	? unknown
	: Record<Exclude<keyof Variants, NumericUnionVariantKey>, never>;

/** A schema value that describes how a value is encoded and decoded. */
export type Schema =
	| PrimitiveType
	| LiteralSchema<unknown>
	| ArraySchema<Schema>
	| ObjectSchema<Record<string, Schema>>
	| OptionalSchema<Schema>
	| UnionSchema<UnionDiscriminantType, UnionVariantMap, string>
	| UntaggedUnionSchema<readonly Schema[]>
	| MapSchema<Schema>
	| BigIntSchema
	| SetSchema<Schema>
	| TupleSchema<Schema[]>
	| (() =>
			| PrimitiveType
			| LiteralSchema<unknown>
			| ArraySchema<Schema>
			| ObjectSchema<Record<string, Schema>>
			| OptionalSchema<Schema>
			| UnionSchema<UnionDiscriminantType, UnionVariantMap, string>
			| UntaggedUnionSchema<readonly Schema[]>
			| MapSchema<Schema>
			| BigIntSchema
			| SetSchema<Schema>
			| TupleSchema<Schema[]>);

/** Schema for a literal value encoded as zero bytes. */
export interface LiteralSchema<Value> {
	_type: "literal";
	value: Value;
}

/** Schema for an array whose elements all use the same schema. */
export interface ArraySchema<Type extends Schema> {
	_type: "array";
	element: Type;
}

/** Schema for an object with fields encoded in declaration order. */
export interface ObjectSchema<Properties extends Record<string, Schema>> {
	_type: "object";
	fields: Properties;
}

/** Schema for a value that may be omitted as `undefined`. */
export interface OptionalSchema<Type extends Schema> {
	_type: "optional";
	schema: Type;
}

/** Schema for a string-keyed object map with homogeneous values. */
export interface MapSchema<Type extends Schema> {
	_type: "map";
	element: Type;
}

/** Schema for a variable-length bigint with a maximum encoded byte length. */
export interface BigIntSchema {
	_type: "bigint";
	maxBytes: number;
}

/** Schema for a set whose elements all use the same schema. */
export interface SetSchema<Type extends Schema> {
	_type: "set";
	element: Type;
}

/** Schema for a fixed-length tuple with one schema per position. */
export interface TupleSchema<Elements extends Schema[]> {
	_type: "tuple";
	elements: Elements;
}

/** Schema for a discriminated union encoded by a string, int, or uint variant tag. */
export interface UnionSchema<
	DiscriminantType extends UnionDiscriminantType,
	Variants extends UnionVariantMap,
	TagName extends string = "type",
> {
	_type: "union";
	tagName: TagName;
	type: DiscriminantType;
	variants: Variants & UnionVariantKeyCheck<DiscriminantType, Variants>;
}

/** Options for a tagged union schema with a configurable tag field name. */
export interface UnionOptions<
	TagName extends string,
	DiscriminantType extends UnionDiscriminantType,
	Variants extends UnionVariantMap,
> {
	tagName: TagName;
	tagType: DiscriminantType;
	variants: Variants & UnionVariantKeyCheck<DiscriminantType, Variants>;
}

/** Schema for an untagged union encoded by a uint variant index. */
export interface UntaggedUnionSchema<Variants extends readonly Schema[]> {
	_type: "untaggedUnion";
	variants: Variants;
}

/** Creates an array schema. */
export function array<Type extends Schema>(element: Type): ArraySchema<Type> {
	return { _type: "array", element };
}

/** Creates an object schema whose fields are encoded in property insertion order. */
export function object<Properties extends Record<string, Schema>>(
	fields: Properties,
): ObjectSchema<Properties> {
	return { _type: "object", fields };
}

/** Creates a string-keyed map schema with homogeneous values. */
export function map<Type extends Schema>(element: Type): MapSchema<Type> {
	return { _type: "map", element };
}

/** Creates a bigint schema, optionally limiting the encoded byte length. */
export function bigint(maxBytes = 128): BigIntSchema {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
		throw new RangeError("bigint maxBytes must be a positive safe integer");
	}
	return { _type: "bigint", maxBytes };
}

/** Creates a set schema with homogeneous elements. */
export function set<Type extends Schema>(element: Type): SetSchema<Type> {
	return { _type: "set", element };
}

/** Creates a tuple schema with one schema per tuple element. */
export function tuple<Elements extends Schema[]>(...elements: Elements): TupleSchema<Elements> {
	return { _type: "tuple", elements };
}

/** Creates a schema for a single literal value that is not encoded. */
export function literal<const Value>(value: Value): LiteralSchema<Value> {
	return { _type: "literal", value };
}

/** Creates a schema for values that may be `undefined`. */
export function optional<Type extends Schema>(schema: Type): OptionalSchema<Type> {
	return { _type: "optional", schema };
}

/** Discovers a schema that can encode and decode the provided runtime value. */
export function schemaOf(value: unknown): Schema {
	return discoverSchema(value, new WeakSet<object>());
}

/** Creates a tagged union schema. */
export function union<
	const TagName extends string,
	const DiscriminantType extends UnionDiscriminantType,
	const Variants extends UnionVariantMap,
>(
	options: UnionOptions<TagName, DiscriminantType, Variants>,
): UnionSchema<DiscriminantType, Variants, TagName>;

/** Creates a tagged union schema with a `type` tag field. */
export function union<
	const DiscriminantType extends UnionDiscriminantType,
	const Variants extends UnionVariantMap,
>(
	discriminantType: DiscriminantType,
	variants: Variants & UnionVariantKeyCheck<DiscriminantType, Variants>,
): UnionSchema<DiscriminantType, Variants>;

/** Creates an untagged union schema. */
export function union<const Variants extends readonly Schema[]>(
	variants: Variants,
): UntaggedUnionSchema<Variants>;

export function union(
	discriminantTypeOrOptionsOrVariants:
		| UnionDiscriminantType
		| UnionOptions<string, UnionDiscriminantType, UnionVariantMap>
		| readonly Schema[],
	variants?: UnionVariantMap,
):
	| UnionSchema<UnionDiscriminantType, UnionVariantMap, string>
	| UntaggedUnionSchema<readonly Schema[]> {
	if (Array.isArray(discriminantTypeOrOptionsOrVariants)) {
		return { _type: "untaggedUnion", variants: discriminantTypeOrOptionsOrVariants };
	}

	if (typeof discriminantTypeOrOptionsOrVariants === "string") {
		return {
			_type: "union",
			tagName: "type",
			type: discriminantTypeOrOptionsOrVariants,
			variants: variants ?? {},
		};
	}

	const options = discriminantTypeOrOptionsOrVariants as UnionOptions<
		string,
		UnionDiscriminantType,
		UnionVariantMap
	>;

	return {
		_type: "union",
		tagName: options.tagName,
		type: options.tagType,
		variants: options.variants,
	};
}

/** Infers the TypeScript value type represented by a schema. */
export type InferType<T extends Schema> = [Schema] extends [T]
	? unknown
	: [T] extends [() => infer S]
		? S extends Schema
			? InferType<S>
			: never
		: [T] extends [PrimitiveType]
			? InferPrimitiveType<T & PrimitiveType>
			: [T] extends [LiteralSchema<infer Value>]
				? Value
				: [T] extends [ArraySchema<infer E>]
					? Array<InferType<E>>
					: [T] extends [ObjectSchema<infer Properties>]
						? ExpandObject<InferObjectType<Properties>>
						: [T] extends [OptionalSchema<infer Type>]
							? InferType<Type> | undefined
							: [T] extends [MapSchema<infer Type>]
								? InferMapType<Type>
								: [T] extends [BigIntSchema]
									? bigint
									: [T] extends [SetSchema<infer Type>]
										? Set<InferType<Type>>
										: [T] extends [TupleSchema<infer Elements>]
											? InferTupleType<Elements>
											: [T] extends [
														UnionSchema<infer DiscriminantType, infer Variants, infer TagName>,
													]
												? InferUnionType<DiscriminantType, Variants, TagName>
												: [T] extends [UntaggedUnionSchema<infer Variants>]
													? InferUntaggedUnionType<Variants>
													: never;

type ExpandObject<Type> = Type extends object ? { [Key in keyof Type]: Type[Key] } : Type;

type InferPrimitiveType<T extends PrimitiveType> = T extends "string"
	? string
	: T extends IntegerPrimitiveType | "float32" | "float64"
		? number
		: T extends "uint8Array"
			? Uint8Array
			: T extends "boolean"
				? boolean
				: T extends "date"
					? Date
					: T extends "unknown"
						? unknown
						: T extends "schema"
							? Schema
							: T extends "null"
								? null
								: T extends "undefined"
									? undefined
									: never;

type OptionalObjectKey<Properties extends Record<string, Schema>> = {
	[Key in keyof Properties]: IsOptionalSchema<Properties[Key]> extends true ? Key : never;
}[keyof Properties];

type IsOptionalSchema<Type extends Schema> = [Type] extends [OptionalSchema<Schema>]
	? true
	: [Type] extends [() => infer Resolved]
		? Resolved extends Schema
			? IsOptionalSchema<Resolved>
			: false
		: false;

type InferObjectType<Properties extends Record<string, Schema>> = {
	-readonly [Key in Exclude<keyof Properties, OptionalObjectKey<Properties>>]: InferType<
		Properties[Key]
	>;
} & {
	-readonly [Key in OptionalObjectKey<Properties>]?: InferType<Properties[Key]>;
};

type InferMapType<Type extends Schema> = {
	[Key: string]: InferType<Type>;
};

type InferTupleType<Elements extends Schema[]> = {
	[K in keyof Elements]: Elements[K] extends Schema ? InferType<Elements[K]> : never;
};

type InferUnionType<
	DiscriminantType extends UnionDiscriminantType,
	Variants extends UnionVariantMap,
	TagName extends string,
> = {
	[Key in keyof Variants]: ExpandObject<
		{
			[Tag in TagName]: InferUnionDiscriminantValue<DiscriminantType, Key>;
		} & InferObjectType<OmitObjectKey<Variants[Key], TagName>>
	>;
}[keyof Variants];

type OmitObjectKey<Properties extends Record<string, Schema>, OmittedKey extends string> = {
	-readonly [Key in keyof Properties as Key extends OmittedKey ? never : Key]: Properties[Key];
};

type InferUnionDiscriminantValue<
	DiscriminantType extends UnionDiscriminantType,
	Key,
> = DiscriminantType extends "string"
	? Key
	: Key extends number
		? Key
		: Key extends `${infer NumberKey extends number}`
			? NumberKey
			: number;

type InferUntaggedUnionType<Variants extends readonly Schema[]> = {
	[Key in keyof Variants]: Variants[Key] extends Schema ? InferType<Variants[Key]> : never;
}[number];

function discoverSchema(value: unknown, stack: WeakSet<object>): Schema {
	switch (typeof value) {
		case "undefined":
			return "undefined";
		case "string":
			return "string";
		case "boolean":
			return "boolean";
		case "bigint":
			return bigint(Math.max(128, getVarBigIntByteLength(value)));
		case "number":
			return discoverNumberSchema(value);
		case "function":
		case "symbol":
			throw new TypeError(`Cannot discover schema for ${typeof value} values`);
		case "object":
			if (value === null) {
				return "null";
			}
			return discoverObjectLikeSchema(value, stack);
	}
}

function discoverNumberSchema(value: number): PrimitiveType {
	if (!Number.isSafeInteger(value)) {
		return "float64";
	}

	return value >= 0 && !Object.is(value, -0) ? "uint" : "int";
}

function discoverObjectLikeSchema(value: object, stack: WeakSet<object>): Schema {
	if (value instanceof Date) {
		return "date";
	}

	if (value instanceof Uint8Array) {
		return "uint8Array";
	}

	if (stack.has(value)) {
		throw new TypeError("Cannot discover schema for cyclic values");
	}

	stack.add(value);
	try {
		if (Array.isArray(value)) {
			return discoverArraySchema(value, stack);
		}

		if (value instanceof Set) {
			return discoverSetSchema(value, stack);
		}

		if (isPlainRecord(value)) {
			return discoverRecordSchema(value as Record<string, unknown>, stack);
		}
	} finally {
		stack.delete(value);
	}

	throw new TypeError(`Cannot discover schema for ${getObjectTypeName(value)} values`);
}

function discoverArraySchema(value: unknown[], stack: WeakSet<object>): ArraySchema<Schema> {
	let elementSchema: Schema | undefined;
	for (let index = 0; index < value.length; index++) {
		elementSchema = joinSchemas(elementSchema, discoverSchema(value[index], stack));
	}
	return array(elementSchema ?? "unknown");
}

function discoverSetSchema(value: Set<unknown>, stack: WeakSet<object>): SetSchema<Schema> {
	let elementSchema: Schema | undefined;
	for (const element of value) {
		elementSchema = joinSchemas(elementSchema, discoverSchema(element, stack));
	}
	return set(elementSchema ?? "unknown");
}

function discoverRecordSchema(
	value: Record<string, unknown>,
	stack: WeakSet<object>,
): ObjectSchema<Record<string, Schema>> {
	if (
		Object.getOwnPropertySymbols(value).some((key) =>
			Object.prototype.propertyIsEnumerable.call(value, key),
		)
	) {
		throw new TypeError("Cannot discover schema for objects with enumerable symbol keys");
	}

	const fields: Record<string, Schema> = {};
	const keys = Object.keys(value);
	for (let index = 0; index < keys.length; index++) {
		const key = keys[index]!;
		fields[key] = discoverSchema(value[key], stack);
	}
	return object(fields);
}

function joinSchemas(left: Schema | undefined, right: Schema): Schema {
	if (!left) {
		return right;
	}

	if (schemasEqual(left, right)) {
		return left;
	}

	if (left === "unknown" || right === "unknown") {
		return "unknown";
	}

	if (left === "undefined") {
		return optional(right);
	}

	if (right === "undefined") {
		return optional(left);
	}

	if (isOptionalSchemaValue(left)) {
		return optional(joinSchemas(left.schema, isOptionalSchemaValue(right) ? right.schema : right));
	}

	if (isOptionalSchemaValue(right)) {
		return optional(joinSchemas(left, right.schema));
	}

	if (typeof left === "function" || typeof right === "function") {
		return schemasEqual(left, right) ? left : "unknown";
	}

	if (typeof left === "string" || typeof right === "string") {
		return joinPrimitiveSchemas(left, right);
	}

	if (left._type !== right._type) {
		return "unknown";
	}

	switch (left._type) {
		case "literal":
			return literalValuesEqual(left.value, (right as LiteralSchema<unknown>).value)
				? left
				: "unknown";
		case "array":
			return array(joinSchemas(left.element, (right as ArraySchema<Schema>).element));
		case "object":
			return joinObjectSchemas(left, right as ObjectSchema<Record<string, Schema>>);
		case "map":
			return map(joinSchemas(left.element, (right as MapSchema<Schema>).element));
		case "bigint":
			return bigint(Math.max(left.maxBytes, (right as BigIntSchema).maxBytes));
		case "set":
			return set(joinSchemas(left.element, (right as SetSchema<Schema>).element));
		case "tuple":
			return joinTupleSchemas(left, right as TupleSchema<Schema[]>);
		case "union":
		case "untaggedUnion":
			return schemasEqual(left, right) ? left : "unknown";
	}
}

function joinPrimitiveSchemas(left: Schema, right: Schema): Schema {
	if (left === right) {
		return left;
	}

	if (isIntegerNumberSchema(left) && isIntegerNumberSchema(right)) {
		return "int";
	}

	if (isNumberSchema(left) && isNumberSchema(right)) {
		return "float64";
	}

	return "unknown";
}

function joinObjectSchemas(
	left: ObjectSchema<Record<string, Schema>>,
	right: ObjectSchema<Record<string, Schema>>,
): ObjectSchema<Record<string, Schema>> {
	const fields: Record<string, Schema> = {};

	const leftKeys = Object.keys(left.fields);
	for (let index = 0; index < leftKeys.length; index++) {
		const key = leftKeys[index]!;
		const leftSchema = left.fields[key]!;
		fields[key] =
			key in right.fields ? joinSchemas(leftSchema, right.fields[key]!) : optional(leftSchema);
	}

	const rightKeys = Object.keys(right.fields);
	for (let index = 0; index < rightKeys.length; index++) {
		const key = rightKeys[index]!;
		if (!(key in left.fields)) {
			fields[key] = optional(right.fields[key]!);
		}
	}

	return object(fields);
}

function joinTupleSchemas(
	left: TupleSchema<Schema[]>,
	right: TupleSchema<Schema[]>,
): TupleSchema<Schema[]> | "unknown" {
	if (left.elements.length !== right.elements.length) {
		return "unknown";
	}

	const elements: Schema[] = new Array(left.elements.length);
	for (let index = 0; index < left.elements.length; index++) {
		elements[index] = joinSchemas(left.elements[index]!, right.elements[index]!);
	}
	return { _type: "tuple", elements };
}

function isIntegerNumberSchema(schema: Schema): schema is IntegerPrimitiveType {
	return (
		schema === "int" ||
		schema === "uint" ||
		schema === "int32" ||
		schema === "uint32" ||
		schema === "int64" ||
		schema === "uint64"
	);
}

function isNumberSchema(schema: Schema): schema is IntegerPrimitiveType | "float32" | "float64" {
	return isIntegerNumberSchema(schema) || schema === "float32" || schema === "float64";
}

function isOptionalSchemaValue(schema: Schema): schema is OptionalSchema<Schema> {
	return typeof schema === "object" && schema !== null && schema._type === "optional";
}

function isPlainRecord(value: object): boolean {
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

function getObjectTypeName(value: object): string {
	return Object.prototype.toString.call(value).slice(8, -1);
}

function getVarBigIntByteLength(value: bigint): number {
	if (value < 0n) {
		value = -value;
	}

	let byteLength = 1;
	value >>= 6n;
	while (value > 0n) {
		byteLength++;
		value >>= 7n;
	}

	return byteLength;
}

/** Returns true when a value is a concrete, serializable schema object. */
export function isSchema(value: unknown): value is Schema {
	return isConcreteSchema(value, new WeakSet<object>());
}

function isConcreteSchema(value: unknown, stack: WeakSet<object>): value is Schema {
	if (typeof value === "string") {
		return isPrimitiveType(value);
	}

	if (typeof value !== "object" || value === null || stack.has(value)) {
		return false;
	}

	stack.add(value);
	try {
		const candidate = value as { _type?: unknown };
		switch (candidate._type) {
			case "literal":
				return true;
			case "array":
				return isConcreteSchema((candidate as ArraySchema<Schema>).element, stack);
			case "object":
				return isSchemaRecord((candidate as ObjectSchema<Record<string, Schema>>).fields, stack);
			case "optional":
				return isConcreteSchema((candidate as OptionalSchema<Schema>).schema, stack);
			case "union":
				return isUnionSchemaValue(candidate, stack);
			case "untaggedUnion": {
				const variants = (candidate as UntaggedUnionSchema<readonly Schema[]>).variants;
				return (
					Array.isArray(variants) && variants.every((variant) => isConcreteSchema(variant, stack))
				);
			}
			case "map":
				return isConcreteSchema((candidate as MapSchema<Schema>).element, stack);
			case "bigint": {
				const maxBytes = (candidate as BigIntSchema).maxBytes;
				return Number.isSafeInteger(maxBytes) && maxBytes >= 1;
			}
			case "set":
				return isConcreteSchema((candidate as SetSchema<Schema>).element, stack);
			case "tuple": {
				const elements = (candidate as TupleSchema<Schema[]>).elements;
				return (
					Array.isArray(elements) && elements.every((element) => isConcreteSchema(element, stack))
				);
			}
			default:
				return false;
		}
	} finally {
		stack.delete(value);
	}
}

function isPrimitiveType(value: string): value is PrimitiveType {
	switch (value) {
		case "string":
		case "int":
		case "int32":
		case "int64":
		case "uint":
		case "uint32":
		case "uint64":
		case "uint8Array":
		case "boolean":
		case "date":
		case "float32":
		case "float64":
		case "unknown":
		case "schema":
		case "null":
		case "undefined":
			return true;
	}
	return false;
}

function isSchemaRecord(value: unknown, stack: WeakSet<object>): value is Record<string, Schema> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return false;
	}

	const entries = Object.values(value);
	for (let index = 0; index < entries.length; index++) {
		if (!isConcreteSchema(entries[index], stack)) {
			return false;
		}
	}

	return true;
}

function isUnionSchemaValue(
	value: { _type?: unknown },
	stack: WeakSet<object>,
): value is UnionSchema<UnionDiscriminantType, UnionVariantMap, string> {
	const schema = value as UnionSchema<UnionDiscriminantType, UnionVariantMap, string>;
	if (
		typeof schema.tagName !== "string" ||
		!isUnionDiscriminantType(schema.type) ||
		!schema.variants ||
		typeof schema.variants !== "object" ||
		Array.isArray(schema.variants)
	) {
		return false;
	}

	const variantSchemas = Object.values(schema.variants);
	for (let index = 0; index < variantSchemas.length; index++) {
		if (!isSchemaRecord(variantSchemas[index], stack)) {
			return false;
		}
	}

	return true;
}

function isUnionDiscriminantType(value: unknown): value is UnionDiscriminantType {
	return (
		value === "string" ||
		value === "int" ||
		value === "uint" ||
		value === "int32" ||
		value === "uint32" ||
		value === "int64" ||
		value === "uint64"
	);
}

function schemasEqual(left: Schema, right: Schema): boolean {
	if (left === right) {
		return true;
	}

	if (typeof left === "function" || typeof right === "function") {
		return false;
	}

	if (typeof left === "string" || typeof right === "string" || left._type !== right._type) {
		return false;
	}

	switch (left._type) {
		case "literal":
			return literalValuesEqual(left.value, (right as LiteralSchema<unknown>).value);
		case "array":
			return schemasEqual(left.element, (right as ArraySchema<Schema>).element);
		case "object":
			return schemaRecordsEqual(
				left.fields,
				(right as ObjectSchema<Record<string, Schema>>).fields,
			);
		case "optional":
			return schemasEqual(left.schema, (right as OptionalSchema<Schema>).schema);
		case "union":
			return unionSchemasEqual(
				left,
				right as UnionSchema<UnionDiscriminantType, UnionVariantMap, string>,
			);
		case "untaggedUnion": {
			const rightVariants = (right as UntaggedUnionSchema<readonly Schema[]>).variants;
			if (left.variants.length !== rightVariants.length) {
				return false;
			}
			for (let index = 0; index < left.variants.length; index++) {
				if (!schemasEqual(left.variants[index]!, rightVariants[index]!)) {
					return false;
				}
			}
			return true;
		}
		case "map":
			return schemasEqual(left.element, (right as MapSchema<Schema>).element);
		case "bigint":
			return left.maxBytes === (right as BigIntSchema).maxBytes;
		case "set":
			return schemasEqual(left.element, (right as SetSchema<Schema>).element);
		case "tuple": {
			const rightElements = (right as TupleSchema<Schema[]>).elements;
			if (left.elements.length !== rightElements.length) {
				return false;
			}
			for (let index = 0; index < left.elements.length; index++) {
				if (!schemasEqual(left.elements[index]!, rightElements[index]!)) {
					return false;
				}
			}
			return true;
		}
	}
}

/** Compares two runtime values for literal schema matching. */
export function literalValuesEqual(left: unknown, right: unknown): boolean {
	return literalValuesEqualInner(left, right, new WeakMap<object, WeakSet<object>>());
}

function literalValuesEqualInner(
	left: unknown,
	right: unknown,
	seen: WeakMap<object, WeakSet<object>>,
): boolean {
	if (Object.is(left, right)) {
		return true;
	}

	if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
		return false;
	}

	if (hasSeenPair(seen, left, right)) {
		return true;
	}

	if (left instanceof Date || right instanceof Date) {
		return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
	}

	if (left instanceof Uint8Array || right instanceof Uint8Array) {
		return left instanceof Uint8Array && right instanceof Uint8Array && bytesEqual(left, right);
	}

	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
			return false;
		}

		for (let index = 0; index < left.length; index++) {
			if (!literalValuesEqualInner(left[index], right[index], seen)) {
				return false;
			}
		}
		return true;
	}

	if (left instanceof Set || right instanceof Set) {
		return (
			left instanceof Set &&
			right instanceof Set &&
			setsEqual(left as Set<unknown>, right as Set<unknown>, seen)
		);
	}

	if (left instanceof Map || right instanceof Map) {
		return (
			left instanceof Map &&
			right instanceof Map &&
			mapsEqual(left as Map<unknown, unknown>, right as Map<unknown, unknown>, seen)
		);
	}

	if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
		return false;
	}

	const leftKeys = getEnumerableOwnKeys(left);
	const rightKeys = getEnumerableOwnKeys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const key of leftKeys) {
		if (
			!Object.hasOwn(right, key) ||
			!literalValuesEqualInner(
				(left as Record<PropertyKey, unknown>)[key],
				(right as Record<PropertyKey, unknown>)[key],
				seen,
			)
		) {
			return false;
		}
	}

	return true;
}

function getEnumerableOwnKeys(value: object): PropertyKey[] {
	const symbolKeys = Object.getOwnPropertySymbols(value).filter((key) =>
		Object.prototype.propertyIsEnumerable.call(value, key),
	);
	return [...Object.keys(value), ...symbolKeys];
}

function hasSeenPair(seen: WeakMap<object, WeakSet<object>>, left: object, right: object): boolean {
	const existing = seen.get(left);
	if (existing?.has(right)) {
		return true;
	}

	if (existing) {
		existing.add(right);
	} else {
		seen.set(left, new WeakSet([right]));
	}
	return false;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
	if (left.byteLength !== right.byteLength) {
		return false;
	}

	for (let index = 0; index < left.byteLength; index++) {
		if (left[index] !== right[index]) {
			return false;
		}
	}
	return true;
}

function setsEqual(
	left: Set<unknown>,
	right: Set<unknown>,
	seen: WeakMap<object, WeakSet<object>>,
): boolean {
	if (left.size !== right.size) {
		return false;
	}

	const unmatched = [...right];
	for (const leftValue of left) {
		const index = unmatched.findIndex((rightValue) =>
			literalValuesEqualInner(leftValue, rightValue, seen),
		);
		if (index === -1) {
			return false;
		}
		unmatched.splice(index, 1);
	}
	return true;
}

function mapsEqual(
	left: Map<unknown, unknown>,
	right: Map<unknown, unknown>,
	seen: WeakMap<object, WeakSet<object>>,
): boolean {
	if (left.size !== right.size) {
		return false;
	}

	const unmatched = [...right];
	for (const [leftKey, leftValue] of left) {
		const index = unmatched.findIndex(
			([rightKey, rightValue]) =>
				literalValuesEqualInner(leftKey, rightKey, seen) &&
				literalValuesEqualInner(leftValue, rightValue, seen),
		);
		if (index === -1) {
			return false;
		}
		unmatched.splice(index, 1);
	}
	return true;
}

function schemaRecordsEqual(left: Record<string, Schema>, right: Record<string, Schema>): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const key of leftKeys) {
		if (!(key in right) || !schemasEqual(left[key]!, right[key]!)) {
			return false;
		}
	}

	return true;
}

function unionSchemasEqual(
	left: UnionSchema<UnionDiscriminantType, UnionVariantMap, string>,
	right: UnionSchema<UnionDiscriminantType, UnionVariantMap, string>,
): boolean {
	return (
		left.tagName === right.tagName &&
		left.type === right.type &&
		unionVariantMapsEqual(left.variants, right.variants)
	);
}

function unionVariantMapsEqual(left: UnionVariantMap, right: UnionVariantMap): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const key of leftKeys) {
		if (!(key in right) || !schemaRecordsEqual(left[key]!, right[key]!)) {
			return false;
		}
	}

	return true;
}
