export type PrimitiveType =
	| "string"
	| "int"
	| "uint"
	| "uint8Array"
	| "boolean"
	| "date"
	| "float32"
	| "float64";

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

export interface ArraySchema<Type extends Schema> {
	_type: "array";
	element: Type;
}

export interface ObjectSchema<Properties extends Record<string, Schema>> {
	_type: "object";
	fields: Properties;
}

export interface OptionalSchema<Type extends Schema> {
	_type: "optional";
	schema: Type;
}

export interface MapSchema<Type extends Schema> {
	_type: "map";
	element: Type;
}

export interface BigIntSchema {
	_type: "bigint";
	maxBytes: number;
}

export interface SetSchema<Type extends Schema> {
	_type: "set";
	element: Type;
}

export interface TupleSchema<Elements extends Schema[]> {
	_type: "tuple";
	elements: Elements;
}

export interface UnionSchema<
	Discriminant extends string,
	Variants extends Record<string, Record<string, Schema>>,
> {
	_type: "union";
	discriminant: Discriminant;
	type: "string" | "int" | "uint";
	variants: Variants;
}

export function array<Type extends Schema>(element: Type): ArraySchema<Type> {
	return { _type: "array", element };
}

export function object<Properties extends Record<string, Schema>>(
	fields: Properties,
): ObjectSchema<Properties> {
	return { _type: "object", fields };
}

export function map<Type extends Schema>(element: Type): MapSchema<Type> {
	return { _type: "map", element };
}

export function bigint(maxBytes = 128): BigIntSchema {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
		throw new RangeError("bigint maxBytes must be a positive safe integer");
	}
	return { _type: "bigint", maxBytes };
}

export function set<Type extends Schema>(element: Type): SetSchema<Type> {
	return { _type: "set", element };
}

export function tuple<Elements extends Schema[]>(...elements: Elements): TupleSchema<Elements> {
	return { _type: "tuple", elements };
}

export function optional<Type extends Schema>(schema: Type): OptionalSchema<Type> {
	return { _type: "optional", schema };
}

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
