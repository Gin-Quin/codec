import {
	createDecoder,
	createEncoder,
	type Decoder,
	toUint8Array,
	toUint8ArrayView,
} from "./binary";
import { compileReader, compileWriter } from "./compiler";
import type { InferType, Schema } from "./schema";

export {
	createDecoder,
	createEncoder,
	Decoder,
	Encoder,
	readDate,
	readFloat32,
	readFloat64,
	readUint8,
	readUint8Array,
	readVarBigInt,
	readVarInt,
	readVarString,
	readVarUint,
	readVarUint8Array,
	toUint8Array,
	toUint8ArrayView,
	writeDate,
	writeFloat32,
	writeFloat64,
	writeUint8,
	writeUint8Array,
	writeVarBigInt,
	writeVarInt,
	writeVarString,
	writeVarUint,
	writeVarUint8Array,
} from "./binary";
export type {
	ArraySchema,
	BigIntSchema,
	InferType,
	MapSchema,
	ObjectSchema,
	OptionalSchema,
	PrimitiveType,
	Schema,
	SetSchema,
	TupleSchema,
	UnionSchema,
} from "./schema";
export { array, bigint, map, object, optional, set, tuple, union } from "./schema";

export interface Codec<T> {
	encode(value: T): Uint8Array<ArrayBuffer>;
	encodeView(value: T): Uint8Array<ArrayBuffer>;
	decode(buffer: Uint8Array | Decoder): T;
}

export function createCodec<T extends Schema>(schema: T): Codec<InferType<T>> {
	const write = compileWriter(schema);
	const read = compileReader(schema);
	const encoder = createEncoder();
	const decoder = createDecoder(new Uint8Array(0));
	let nextViewEncoderSize: number | undefined;

	function writeCopiedValue(value: InferType<T>) {
		encoder.pos = 0;
		write(encoder, value);
		return encoder;
	}

	function writeViewValue(value: InferType<T>) {
		const viewEncoder = createEncoder(nextViewEncoderSize);
		write(viewEncoder, value);
		nextViewEncoderSize = viewEncoder.pos;
		return viewEncoder;
	}

	return {
		encode: (value: InferType<T>): Uint8Array<ArrayBuffer> => {
			return toUint8Array(writeCopiedValue(value));
		},
		encodeView: (value: InferType<T>): Uint8Array<ArrayBuffer> => {
			return toUint8ArrayView(writeViewValue(value));
		},
		decode: (buffer: Uint8Array | Decoder): InferType<T> => {
			if (!(buffer instanceof Uint8Array)) {
				return read(buffer);
			}

			decoder.arr = buffer;
			decoder.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
			decoder.pos = 0;
			return read(decoder);
		},
	} as Codec<InferType<T>>;
}
