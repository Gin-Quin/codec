const bit7 = 0b0100_0000;
const bit8 = 0b1000_0000;
const bits6 = 0b0011_1111;
const bits7 = 0b0111_1111;
const defaultBufferSize = 128;
const maxUint32 = 0xffff_ffff;
const maxDirectAsciiStringSize = 64;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const stringBuffer = new Uint8Array(30_000);
const maxStringBufferSize = stringBuffer.length / 3;

interface CachedString {
	bytes: Uint8Array;
	value: string;
}

/** Mutable byte writer used by low-level encoding helpers. */
export class Encoder {
	/** Backing byte buffer. */
	buffer: Uint8Array<ArrayBuffer>;
	/** DataView over the backing buffer for fixed-width writes. */
	view: DataView<ArrayBuffer>;
	/** Current write offset in bytes. */
	pos: number;

	/** Creates an encoder with an optional initial buffer size. */
	constructor(initialSize = defaultBufferSize) {
		this.buffer = new Uint8Array(initialSize);
		this.view = new DataView(this.buffer.buffer);
		this.pos = 0;
	}
}

/** Mutable byte reader used by low-level decoding helpers. */
export class Decoder {
	/** Bytes being decoded. */
	arr: Uint8Array;
	/** DataView over the decoded bytes for fixed-width reads. */
	view: DataView<ArrayBufferLike>;
	/** Current read offset in bytes. */
	pos: number;

	/** Creates a decoder for a byte array and optional starting offset. */
	constructor(uint8Array: Uint8Array, pos = 0) {
		this.arr = uint8Array;
		this.view = new DataView(uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength);
		this.pos = pos;
	}
}

/** Creates an encoder for low-level writes. */
export function createEncoder(initialSize?: number): Encoder {
	return new Encoder(initialSize);
}

/** Creates a decoder for low-level reads. */
export function createDecoder(uint8Array: Uint8Array): Decoder {
	return new Decoder(uint8Array);
}

/** Copies the written portion of an encoder into an exact-sized `Uint8Array`. */
export function toUint8Array(encoder: Encoder): Uint8Array<ArrayBuffer> {
	return encoder.buffer.slice(0, encoder.pos);
}

/** Ensures an encoder has room for the next number of bytes. */
export function ensureCapacity(encoder: Encoder, byteLength: number): void {
	const required = encoder.pos + byteLength;
	if (required <= encoder.buffer.length) {
		return;
	}

	let nextLength = encoder.buffer.length * 2;
	while (nextLength < required) {
		nextLength *= 2;
	}

	const next = new Uint8Array(nextLength);
	next.set(encoder.buffer);
	encoder.buffer = next;
	encoder.view = new DataView(next.buffer);
}

/** Writes one unsigned byte. */
export function writeUint8(encoder: Encoder, value: number): void {
	ensureCapacity(encoder, 1);
	encoder.buffer[encoder.pos++] = value;
}

/** Reads one unsigned byte. */
export function readUint8(decoder: Decoder): number {
	if (decoder.pos >= decoder.arr.length) {
		throw new Error("Unexpected end of array");
	}
	return decoder.arr[decoder.pos++]!;
}

/** Writes raw bytes without a length prefix. */
export function writeUint8Array(encoder: Encoder, value: Uint8Array): void {
	ensureCapacity(encoder, value.byteLength);
	encoder.buffer.set(value, encoder.pos);
	encoder.pos += value.byteLength;
}

/** Reads raw bytes without reading a length prefix. */
export function readUint8Array(decoder: Decoder, byteLength: number): Uint8Array {
	if (decoder.pos + byteLength > decoder.arr.length) {
		throw new Error("Unexpected end of array");
	}

	const value = new Uint8Array(
		decoder.arr.buffer,
		decoder.arr.byteOffset + decoder.pos,
		byteLength,
	);
	decoder.pos += byteLength;
	return value;
}

/** Writes a 32-bit floating-point number in little-endian byte order. */
export function writeFloat32(encoder: Encoder, value: number): void {
	ensureCapacity(encoder, 4);
	encoder.view.setFloat32(encoder.pos, value, true);
	encoder.pos += 4;
}

/** Reads a 32-bit floating-point number in little-endian byte order. */
export function readFloat32(decoder: Decoder): number {
	if (decoder.pos + 4 > decoder.arr.length) {
		throw new Error("Unexpected end of array");
	}

	const value = decoder.view.getFloat32(decoder.pos, true);
	decoder.pos += 4;
	return value;
}

/** Writes a 64-bit floating-point number in little-endian byte order. */
export function writeFloat64(encoder: Encoder, value: number): void {
	ensureCapacity(encoder, 8);
	encoder.view.setFloat64(encoder.pos, value, true);
	encoder.pos += 8;
}

/** Reads a 64-bit floating-point number in little-endian byte order. */
export function readFloat64(decoder: Decoder): number {
	if (decoder.pos + 8 > decoder.arr.length) {
		throw new Error("Unexpected end of array");
	}

	const value = decoder.view.getFloat64(decoder.pos, true);
	decoder.pos += 8;
	return value;
}

/** Writes an unsigned safe integer using variable-length encoding. */
export function writeVarUint(encoder: Encoder, value: number): void {
	if (value >= 0 && value <= bits7) {
		ensureCapacity(encoder, 1);
		encoder.buffer[encoder.pos++] = value;
		return;
	}

	if (value >= 0 && value <= maxUint32) {
		ensureCapacity(encoder, 5);
		const buffer = encoder.buffer;
		let pos = encoder.pos;
		let remaining = value >>> 0;

		while (remaining > bits7) {
			buffer[pos++] = bit8 | (remaining & bits7);
			remaining >>>= 7;
		}

		buffer[pos++] = remaining;
		encoder.pos = pos;
		return;
	}

	ensureCapacity(encoder, 8);
	const buffer = encoder.buffer;
	let pos = encoder.pos;

	while (value > bits7) {
		buffer[pos++] = bit8 | (bits7 & value);
		value = Math.floor(value / 128);
	}

	buffer[pos++] = bits7 & value;
	encoder.pos = pos;
}

/** Reads an unsigned safe integer using variable-length encoding. */
export function readVarUint(decoder: Decoder): number {
	const buffer = decoder.arr;
	let pos = decoder.pos;
	const length = buffer.length;

	if (pos >= length) {
		throw new Error("Unexpected end of array");
	}

	let byte = buffer[pos++]!;
	let value = byte & bits7;
	if (byte < bit8) {
		decoder.pos = pos;
		return value;
	}

	if (pos >= length) {
		decoder.pos = pos;
		throw new Error("Unexpected end of array");
	}

	byte = buffer[pos++]!;
	value |= (byte & bits7) << 7;
	if (byte < bit8) {
		decoder.pos = pos;
		return value;
	}

	if (pos >= length) {
		decoder.pos = pos;
		throw new Error("Unexpected end of array");
	}

	byte = buffer[pos++]!;
	value |= (byte & bits7) << 14;
	if (byte < bit8) {
		decoder.pos = pos;
		return value;
	}

	if (pos >= length) {
		decoder.pos = pos;
		throw new Error("Unexpected end of array");
	}

	byte = buffer[pos++]!;
	value |= (byte & bits7) << 21;
	if (byte < bit8) {
		decoder.pos = pos;
		return value;
	}

	if (pos >= length) {
		decoder.pos = pos;
		throw new Error("Unexpected end of array");
	}

	byte = buffer[pos++]!;
	value += (byte & bits7) * 0x1000_0000;
	decoder.pos = pos;
	if (byte < bit8) {
		return value;
	}

	return readVarUintSlow(decoder, value, 0x8_0000_0000);
}

function readVarUintSlow(decoder: Decoder, value: number, multiplier: number): number {
	const length = decoder.arr.length;

	while (decoder.pos < length) {
		const byte = decoder.arr[decoder.pos++]!;
		value += (byte & bits7) * multiplier;
		multiplier *= 128;

		if (byte < bit8) {
			return value;
		}

		if (value > Number.MAX_SAFE_INTEGER) {
			throw new Error("Integer out of range");
		}
	}

	throw new Error("Unexpected end of array");
}

/** Writes a signed safe integer using variable-length encoding. */
export function writeVarInt(encoder: Encoder, value: number): void {
	const isNegative = value !== 0 ? value < 0 : 1 / value < 0;
	if (isNegative) {
		value = -value;
	}

	if (value <= bits6) {
		ensureCapacity(encoder, 1);
		encoder.buffer[encoder.pos++] = (isNegative ? bit7 : 0) | value;
		return;
	}

	if (value <= maxUint32) {
		ensureCapacity(encoder, 5);
		const buffer = encoder.buffer;
		let pos = encoder.pos;
		let remaining = value >>> 0;

		buffer[pos++] = (remaining > bits6 ? bit8 : 0) | (isNegative ? bit7 : 0) | (remaining & bits6);
		remaining >>>= 6;

		while (remaining > 0) {
			buffer[pos++] = (remaining > bits7 ? bit8 : 0) | (remaining & bits7);
			remaining >>>= 7;
		}

		encoder.pos = pos;
		return;
	}

	ensureCapacity(encoder, 8);
	const buffer = encoder.buffer;
	let pos = encoder.pos;
	buffer[pos++] = (value > bits6 ? bit8 : 0) | (isNegative ? bit7 : 0) | (bits6 & value);
	value = Math.floor(value / 64);

	while (value > 0) {
		buffer[pos++] = (value > bits7 ? bit8 : 0) | (bits7 & value);
		value = Math.floor(value / 128);
	}

	encoder.pos = pos;
}

/** Reads a signed safe integer using variable-length encoding. */
export function readVarInt(decoder: Decoder): number {
	const buffer = decoder.arr;
	let pos = decoder.pos;
	const length = buffer.length;

	if (pos >= length) {
		throw new Error("Unexpected end of array");
	}

	let byte = buffer[pos++]!;
	let value = byte & bits6;
	const sign = (byte & bit7) > 0 ? -1 : 1;

	if ((byte & bit8) === 0) {
		decoder.pos = pos;
		return sign * value;
	}

	if (pos >= length) {
		decoder.pos = pos;
		throw new Error("Unexpected end of array");
	}

	byte = buffer[pos++]!;
	value += (byte & bits7) * 0x40;
	if (byte < bit8) {
		decoder.pos = pos;
		return sign * value;
	}

	if (pos >= length) {
		decoder.pos = pos;
		throw new Error("Unexpected end of array");
	}

	byte = buffer[pos++]!;
	value += (byte & bits7) * 0x2000;
	if (byte < bit8) {
		decoder.pos = pos;
		return sign * value;
	}

	if (pos >= length) {
		decoder.pos = pos;
		throw new Error("Unexpected end of array");
	}

	byte = buffer[pos++]!;
	value += (byte & bits7) * 0x10_0000;
	if (byte < bit8) {
		decoder.pos = pos;
		return sign * value;
	}

	if (pos >= length) {
		decoder.pos = pos;
		throw new Error("Unexpected end of array");
	}

	byte = buffer[pos++]!;
	value += (byte & bits7) * 0x800_0000;
	decoder.pos = pos;
	if (byte < bit8) {
		return sign * value;
	}

	return readVarIntSlow(decoder, value, 0x4_0000_0000, sign);
}

function readVarIntSlow(decoder: Decoder, value: number, multiplier: number, sign: number): number {
	const length = decoder.arr.length;
	while (decoder.pos < length) {
		const byte = decoder.arr[decoder.pos++]!;
		value += (byte & bits7) * multiplier;
		multiplier *= 128;

		if (byte < bit8) {
			return sign * value;
		}

		if (value > Number.MAX_SAFE_INTEGER) {
			throw new Error("Integer out of range");
		}
	}

	throw new Error("Unexpected end of array");
}

/** Writes a signed bigint using variable-length encoding. */
export function writeVarBigInt(encoder: Encoder, value: bigint, maxBytes = 128): void {
	validateMaxBytes(maxBytes);

	const isNegative = value < 0n;
	if (isNegative) {
		value = -value;
	}

	let byte = Number(value & 0x3fn);
	value >>= 6n;
	writeUint8(encoder, (value > 0n ? bit8 : 0) | (isNegative ? bit7 : 0) | byte);
	let byteLength = 1;

	while (value > 0n) {
		if (byteLength >= maxBytes) {
			throw new Error(`BigInt exceeds maxBytes (${maxBytes})`);
		}

		byte = Number(value & 0x7fn);
		value >>= 7n;
		writeUint8(encoder, (value > 0n ? bit8 : 0) | byte);
		byteLength++;
	}
}

/** Reads a signed bigint using variable-length encoding. */
export function readVarBigInt(decoder: Decoder, maxBytes = 128): bigint {
	validateMaxBytes(maxBytes);

	let byte = readUint8(decoder);
	let value = BigInt(byte & bits6);
	const isNegative = (byte & bit7) > 0;
	let shift = 6n;
	let byteLength = 1;

	while ((byte & bit8) > 0) {
		if (byteLength >= maxBytes) {
			throw new Error(`BigInt exceeds maxBytes (${maxBytes})`);
		}

		byte = readUint8(decoder);
		byteLength++;
		value |= BigInt(byte & bits7) << shift;
		shift += 7n;
	}

	return isNegative ? -value : value;
}

function validateMaxBytes(maxBytes: number): void {
	if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
		throw new RangeError("maxBytes must be a positive safe integer");
	}
}

/** Writes a valid `Date` as its millisecond timestamp. */
export function writeDate(encoder: Encoder, value: Date): void {
	const time = value.getTime();
	if (Number.isNaN(time)) {
		throw new Error("Cannot encode invalid Date");
	}
	writeFloat64(encoder, time);
}

/** Reads a `Date` from a millisecond timestamp. */
export function readDate(decoder: Decoder): Date {
	const value = new Date(readFloat64(decoder));
	if (Number.isNaN(value.getTime())) {
		throw new Error("Cannot decode invalid Date");
	}
	return value;
}

/** Writes a byte array prefixed by its variable-length byte length. */
export function writeVarUint8Array(encoder: Encoder, value: Uint8Array): void {
	writeVarUint(encoder, value.byteLength);
	writeUint8Array(encoder, value);
}

/** Reads a byte array prefixed by its variable-length byte length. */
export function readVarUint8Array(decoder: Decoder): Uint8Array {
	return readUint8Array(decoder, readVarUint(decoder));
}

/** Writes a UTF-8 string prefixed by its variable-length byte length. */
export function writeVarString(encoder: Encoder, value: string): void {
	const start = encoder.pos;
	ensureCapacity(encoder, value.length + 8);

	const buffer = encoder.buffer;
	let pos = encoder.pos;
	let byteLength = value.length;
	while (byteLength > bits7) {
		buffer[pos++] = bit8 | (bits7 & byteLength);
		byteLength = Math.floor(byteLength / 128);
	}
	buffer[pos++] = bits7 & byteLength;

	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code > 0x7f) {
			encoder.pos = start;
			writeVarStringUtf8(encoder, value);
			return;
		}
		buffer[pos++] = code;
	}

	encoder.pos = pos;
}

function writeVarStringUtf8(encoder: Encoder, value: string): void {
	if (value.length < maxStringBufferSize) {
		const written = textEncoder.encodeInto(value, stringBuffer).written;
		ensureCapacity(encoder, written + 8);

		const buffer = encoder.buffer;
		let pos = encoder.pos;
		let byteLength = written;
		while (byteLength > bits7) {
			buffer[pos++] = bit8 | (bits7 & byteLength);
			byteLength = Math.floor(byteLength / 128);
		}

		buffer[pos++] = bits7 & byteLength;
		buffer.set(stringBuffer.subarray(0, written), pos);
		encoder.pos = pos + written;
		return;
	}

	writeVarUint8Array(encoder, textEncoder.encode(value));
}

/** Reads a UTF-8 string prefixed by its variable-length byte length. */
export function readVarString(decoder: Decoder): string {
	const byteLength = readVarUint(decoder);
	if (decoder.pos + byteLength > decoder.arr.length) {
		throw new Error("Unexpected end of array");
	}

	return readStringBytes(decoder, byteLength);
}

/** Reads a length-prefixed UTF-8 string with a caller-provided cache slot. */
export function readCachedVarString(
	decoder: Decoder,
	cache: Array<CachedString | undefined>,
	index: number,
): string {
	const byteLength = readVarUint(decoder);
	if (decoder.pos + byteLength > decoder.arr.length) {
		throw new Error("Unexpected end of array");
	}

	const cached = cache[index];
	if (
		cached !== undefined &&
		cached.bytes.byteLength === byteLength &&
		bytesEqual(decoder.arr, decoder.pos, cached.bytes)
	) {
		decoder.pos += byteLength;
		return cached.value;
	}

	const start = decoder.pos;
	const value = readStringBytes(decoder, byteLength);
	cache[index] = {
		bytes: decoder.arr.slice(start, start + byteLength),
		value,
	};
	return value;
}

function readStringBytes(decoder: Decoder, byteLength: number): string {
	if (byteLength <= maxDirectAsciiStringSize) {
		let value = "";
		for (let index = 0; index < byteLength; index++) {
			const byte = decoder.arr[decoder.pos + index]!;
			if (byte > 0x7f) {
				value = textDecoder.decode(decoder.arr.subarray(decoder.pos, decoder.pos + byteLength));
				decoder.pos += byteLength;
				return value;
			}
			value += String.fromCharCode(byte);
		}
		decoder.pos += byteLength;
		return value;
	}

	const value = textDecoder.decode(decoder.arr.subarray(decoder.pos, decoder.pos + byteLength));
	decoder.pos += byteLength;
	return value;
}

function bytesEqual(buffer: Uint8Array, pos: number, bytes: Uint8Array): boolean {
	for (let index = 0; index < bytes.byteLength; index++) {
		if (buffer[pos + index] !== bytes[index]) {
			return false;
		}
	}
	return true;
}
