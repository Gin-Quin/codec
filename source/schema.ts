/** Primitive schema names supported by codec. */
export type PrimitiveType =
	| "string"
	| "int"
	| "uint"
	| "uint8Array"
	| "boolean"
	| "date"
	| "float32"
	| "float64";

/** A schema value that describes how a value is encoded and decoded. */
export type Schema =
	| PrimitiveType
	| ArraySchema<Schema>
	| ObjectSchema<Record<string, Schema>>
	| OptionalSchema<Schema>
	| UnionSchema<string, Record<string, Record<string, Schema>>>
	| MapSchema<Schema>
	| BigIntSchema
	| SetSchema<Schema>
	| TupleSchema<Schema[]>
	| (() =>
			| PrimitiveType
			| ArraySchema<Schema>
			| ObjectSchema<Record<string, Schema>>
			| OptionalSchema<Schema>
			| UnionSchema<string, Record<string, Record<string, Schema>>>
			| MapSchema<Schema>
			| BigIntSchema
			| SetSchema<Schema>
			| TupleSchema<Schema[]>);

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
	Discriminant extends string,
	Variants extends Record<string, Record<string, Schema>>,
> {
	_type: "union";
	discriminant: Discriminant;
	type: "string" | "int" | "uint";
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

/** Creates a schema for values that may be `undefined`. */
export function optional<Type extends Schema>(schema: Type): OptionalSchema<Type> {
	return { _type: "optional", schema };
}

/** Creates a discriminated union schema. */
export function union<
	Discriminant extends string,
	Variants extends Record<string, Record<string, Schema>>,
>(
	discriminant: Discriminant,
	type: "string" | "int" | "uint",
	variants: Variants,
): UnionSchema<Discriminant, Variants> {
	return { _type: "union", discriminant, type, variants };
}

/** Infers the TypeScript value type represented by a schema. */
export type InferType<T extends Schema> = [T] extends [() => infer S]
	? S extends Schema
		? InferType<S>
		: never
	: [T] extends [PrimitiveType]
		? InferPrimitiveType<T & PrimitiveType>
		: [T] extends [ArraySchema<infer E>]
			? Array<InferType<E>>
			: [T] extends [ObjectSchema<infer Properties>]
				? InferObjectType<Properties>
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
									: [T] extends [UnionSchema<infer Discriminant, infer Variants>]
										? InferUnionType<Discriminant, Variants>
										: never;

type InferPrimitiveType<T extends PrimitiveType> = T extends "string"
	? string
	: T extends "int" | "uint" | "float32" | "float64"
		? number
		: T extends "uint8Array"
			? Uint8Array
			: T extends "boolean"
				? boolean
				: T extends "date"
					? Date
					: never;

type InferObjectType<Properties extends Record<string, Schema>> = {
	[Key in keyof Properties]: InferType<Properties[Key]>;
};

type InferMapType<Type extends Schema> = {
	[Key: string]: InferType<Type>;
};

type InferTupleType<Elements extends Schema[]> = {
	[K in keyof Elements]: Elements[K] extends Schema ? InferType<Elements[K]> : never;
};

type InferUnionType<
	Discriminant extends string,
	Variants extends Record<string, Record<string, Schema>>,
> = {
	[Key in keyof Variants]: {
		[D in Discriminant]: Key;
	} & {
		[K in keyof Variants[Key]]: InferType<Variants[Key][K]>;
	};
}[keyof Variants];
