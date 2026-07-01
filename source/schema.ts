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

/** Primitive schemas that can encode a union variant discriminant. */
export type UnionDiscriminantType = "string" | "int" | "uint";

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
			| ArraySchema<Schema>
			| ObjectSchema<Record<string, Schema>>
			| OptionalSchema<Schema>
			| UnionSchema<UnionDiscriminantType, UnionVariantMap, string>
			| UntaggedUnionSchema<readonly Schema[]>
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

/** Creates a schema for values that may be `undefined`. */
export function optional<Type extends Schema>(schema: Type): OptionalSchema<Type> {
	return { _type: "optional", schema };
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
export type InferType<T extends Schema> = [T] extends [() => infer S]
	? S extends Schema
		? InferType<S>
		: never
	: [T] extends [PrimitiveType]
		? InferPrimitiveType<T & PrimitiveType>
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
									: [T] extends [UnionSchema<infer DiscriminantType, infer Variants, infer TagName>]
										? InferUnionType<DiscriminantType, Variants, TagName>
										: [T] extends [UntaggedUnionSchema<infer Variants>]
											? InferUntaggedUnionType<Variants>
											: never;

type ExpandObject<Type> = Type extends object ? { [Key in keyof Type]: Type[Key] } : Type;

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
