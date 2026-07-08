# Codec Benchmarks

65 rows from 5 cases, generated 7/8/2026, 12:39:02 PM.

Each serializer is tested on the same case payloads over repeated encode and decode runs, using median timings from the saved benchmark report.

## Average results

Mean values across all benchmark cases.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥈 10,414 | 🥈 0.47x | 🥇 18.9 | 🥇 18.8 | 🥇 38.4 | 🥇 0.57x |
| avsc 🥈 | Avro | 🥉 10,616 | 🥉 0.48x | 30.7 | 🥉 35.7 | 🥈 66.2 | 🥈 0.99x |
| msgpackr-records 🥉 | MessagePack | 10,724 | 0.49x | 🥉 29.1 | 37.4 | 🥉 66.5 | 🥉 0.99x |
| json | JSON text | 21,934 | 1.00x | 🥈 23.4 | 43.7 | 67.1 | 1.00x |
| v8 | V8 serialized value | 24,052 | 1.10x | 62.0 | 🥈 34.3 | 96.3 | 1.43x |
| msgpackr | MessagePack | 16,788 | 0.77x | 34.4 | 64.1 | 98.6 | 1.47x |
| cbor-x | CBOR | 17,139 | 0.78x | 30.5 | 67.6 | 101.8 | 1.52x |
| @msgpack/msgpack | MessagePack | 16,475 | 0.75x | 57.1 | 102.3 | 159.7 | 2.38x |
| bunker | Bunker | 🥇 8,156 | 🥇 0.37x | 145.2 | 56.5 | 201.6 | 3.00x |
| bson | BSON | 27,199 | 1.24x | 84.8 | 137.5 | 225.1 | 3.35x |
| protobufjs | Protocol Buffers Struct | 33,671 | 1.54x | 217.3 | 211.3 | 429.0 | 6.39x |
| flatbuffers-flexbuffers | FlexBuffers | 11,893 | 0.54x | 257.2 | 204.1 | 465.7 | 6.94x |
| @bufbuild/protobuf | Protocol Buffers Struct | 33,671 | 1.54x | 1103.0 | 1163.5 | 2269.8 | 33.82x |

## profile

One medium nested object with strings, numbers, booleans, arrays, and maps.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥇 803 | 🥇 0.74x | 🥈 0.80 | 🥇 1.09 | 🥇 1.89 | 🥇 0.93x |
| json 🥈 | JSON text | 1,082 | 1.00x | 🥇 0.75 | 🥈 1.28 | 🥈 2.04 | 🥈 1.00x |
| avsc 🥉 | Avro | 🥈 806 | 🥈 0.74x | 🥉 1.11 | 2.76 | 🥉 4.24 | 🥉 2.07x |
| msgpackr | MessagePack | 949 | 0.88x | 1.24 | 3.34 | 4.58 | 2.25x |
| v8 | V8 serialized value | 1,266 | 1.17x | 2.41 | 🥉 2.30 | 4.75 | 2.33x |
| @msgpack/msgpack | MessagePack | 🥉 943 | 🥉 0.87x | 1.74 | 3.28 | 5.01 | 2.45x |
| cbor-x | CBOR | 957 | 0.88x | 1.15 | 4.14 | 5.29 | 2.59x |
| msgpackr-records | MessagePack | 955 | 0.88x | 1.64 | 4.00 | 5.68 | 2.78x |
| bson | BSON | 1,127 | 1.04x | 2.58 | 6.57 | 9.15 | 4.48x |
| bunker | Bunker | 978 | 0.90x | 5.83 | 8.66 | 14.3 | 6.99x |
| protobufjs | Protocol Buffers Struct | 1,369 | 1.27x | 7.04 | 7.89 | 14.9 | 7.31x |
| flatbuffers-flexbuffers | FlexBuffers | 1,134 | 1.05x | 18.4 | 9.39 | 27.7 | 13.59x |
| @bufbuild/protobuf | Protocol Buffers Struct | 1,369 | 1.27x | 32.8 | 33.4 | 66.2 | 32.45x |

## coupon-batch

A batch of compact, repeated payment-style records inspired by avsc's Coupon benchmark.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 7,589 | 0.35x | 🥇 11.0 | 🥇 13.6 | 🥇 24.7 | 🥇 0.51x |
| msgpackr-records 🥈 | MessagePack | 🥈 6,125 | 🥈 0.28x | 🥈 19.6 | 25.5 | 🥈 45.0 | 🥈 0.93x |
| json 🥉 | JSON text | 21,658 | 1.00x | 🥉 20.1 | 28.1 | 🥉 48.4 | 🥉 1.00x |
| v8 | V8 serialized value | 12,667 | 0.58x | 41.7 | 🥉 24.3 | 66.1 | 1.37x |
| avsc | Avro | 🥉 6,927 | 🥉 0.32x | 29.1 | 42.2 | 70.9 | 1.46x |
| bunker | Bunker | 🥇 3,407 | 🥇 0.16x | 63.5 | 🥈 22.2 | 86.0 | 1.78x |
| msgpackr | MessagePack | 16,687 | 0.77x | 32.1 | 71.9 | 104.2 | 2.15x |
| cbor-x | CBOR | 16,713 | 0.77x | 29.8 | 81.4 | 111.4 | 2.30x |
| @msgpack/msgpack | MessagePack | 16,429 | 0.76x | 39.4 | 87.0 | 126.5 | 2.61x |
| bson | BSON | 21,044 | 0.97x | 54.4 | 162.3 | 216.5 | 4.47x |
| protobufjs | Protocol Buffers Struct | 26,112 | 1.21x | 182.7 | 193.6 | 375.2 | 7.75x |
| flatbuffers-flexbuffers | FlexBuffers | 8,108 | 0.37x | 170.7 | 207.7 | 378.4 | 7.82x |
| @bufbuild/protobuf | Protocol Buffers Struct | 26,112 | 1.21x | 743.8 | 767.3 | 1510.0 | 31.21x |

## task-board

A collection-like object with nested records and repeated child objects.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥉 23,664 | 🥉 0.62x | 🥇 28.4 | 🥇 35.3 | 🥇 67.1 | 🥇 0.74x |
| avsc 🥈 | Avro | 23,917 | 0.63x | 🥉 40.5 | 🥈 48.3 | 🥈 88.3 | 🥈 0.98x |
| json 🥉 | JSON text | 38,080 | 1.00x | 🥈 29.9 | 60.6 | 🥉 90.2 | 🥉 1.00x |
| msgpackr-records | MessagePack | 24,130 | 0.63x | 40.9 | 🥉 50.2 | 91.7 | 1.02x |
| msgpackr | MessagePack | 32,949 | 0.87x | 46.4 | 88.5 | 134.8 | 1.49x |
| v8 | V8 serialized value | 31,417 | 0.83x | 109.6 | 53.7 | 163.3 | 1.81x |
| cbor-x | CBOR | 33,050 | 0.87x | 44.1 | 103.0 | 165.3 | 1.83x |
| bunker | Bunker | 🥇 14,668 | 🥇 0.39x | 196.6 | 83.0 | 279.9 | 3.10x |
| @msgpack/msgpack | MessagePack | 32,453 | 0.85x | 83.9 | 217.4 | 301.3 | 3.34x |
| bson | BSON | 42,103 | 1.11x | 99.0 | 223.5 | 322.8 | 3.58x |
| protobufjs | Protocol Buffers Struct | 45,372 | 1.19x | 255.0 | 268.9 | 524.0 | 5.81x |
| flatbuffers-flexbuffers | FlexBuffers | 🥈 21,275 | 🥈 0.56x | 317.5 | 294.7 | 611.3 | 6.78x |
| @bufbuild/protobuf | Protocol Buffers Struct | 45,372 | 1.19x | 1153.9 | 1279.8 | 2433.7 | 26.98x |

## vector-tile

A vector-tile style payload with nested arrays and many small unsigned integers.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥇 7,995 | 🥇 0.34x | 🥇 34.5 | 🥇 20.4 | 🥇 54.9 | 🥇 0.47x |
| avsc 🥈 | Avro | 🥉 9,356 | 🥉 0.40x | 48.4 | 🥈 38.6 | 🥈 86.9 | 🥈 0.75x |
| msgpackr-records 🥉 | MessagePack | 9,727 | 0.42x | 48.5 | 59.8 | 🥉 108.5 | 🥉 0.93x |
| cbor-x | CBOR | 13,932 | 0.60x | 🥈 41.2 | 72.2 | 113.3 | 0.97x |
| json | JSON text | 23,196 | 1.00x | 🥉 42.5 | 74.1 | 116.5 | 1.00x |
| bunker | Bunker | 🥈 8,293 | 🥈 0.36x | 65.6 | 🥉 51.6 | 116.9 | 1.00x |
| msgpackr | MessagePack | 12,413 | 0.54x | 47.8 | 80.6 | 128.5 | 1.10x |
| v8 | V8 serialized value | 50,648 | 2.18x | 84.3 | 51.7 | 136.1 | 1.17x |
| @msgpack/msgpack | MessagePack | 12,027 | 0.52x | 101.2 | 59.3 | 160.9 | 1.38x |
| bson | BSON | 44,061 | 1.90x | 188.1 | 115.8 | 304.5 | 2.61x |
| flatbuffers-flexbuffers | FlexBuffers | 13,074 | 0.56x | 275.0 | 241.0 | 516.6 | 4.43x |
| protobufjs | Protocol Buffers Struct | 62,651 | 2.70x | 403.5 | 353.6 | 757.1 | 6.50x |
| @bufbuild/protobuf | Protocol Buffers Struct | 62,651 | 2.70x | 2671.9 | 2762.3 | 5449.9 | 46.77x |

## search-index

A large object with a long string snapshot, arrays, and a large string-keyed index.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥇 12,018 | 🥇 0.47x | 🥇 19.8 | 🥇 23.5 | 🥇 43.2 | 🥇 0.55x |
| json 🥈 | JSON text | 25,656 | 1.00x | 🥈 24.0 | 54.4 | 🥈 78.4 | 🥈 1.00x |
| avsc 🥉 | Avro | 🥈 12,072 | 🥈 0.47x | 🥉 34.1 | 🥉 46.7 | 🥉 80.8 | 🥉 1.03x |
| msgpackr-records | MessagePack | 🥉 12,684 | 🥉 0.49x | 34.7 | 47.4 | 81.6 | 1.04x |
| v8 | V8 serialized value | 24,261 | 0.95x | 71.9 | 🥈 39.4 | 111.0 | 1.42x |
| cbor-x | CBOR | 21,042 | 0.82x | 36.5 | 77.5 | 113.9 | 1.45x |
| msgpackr | MessagePack | 20,942 | 0.82x | 44.4 | 76.3 | 121.0 | 1.54x |
| @msgpack/msgpack | MessagePack | 20,522 | 0.80x | 59.0 | 144.5 | 204.7 | 2.61x |
| bson | BSON | 27,660 | 1.08x | 80.0 | 179.4 | 272.8 | 3.48x |
| protobufjs | Protocol Buffers Struct | 32,851 | 1.28x | 238.2 | 232.4 | 473.9 | 6.04x |
| bunker | Bunker | 13,435 | 0.52x | 394.5 | 117.1 | 511.1 | 6.52x |
| flatbuffers-flexbuffers | FlexBuffers | 15,875 | 0.62x | 504.5 | 268.0 | 794.2 | 10.13x |
| @bufbuild/protobuf | Protocol Buffers Struct | 32,851 | 1.28x | 912.5 | 974.6 | 1889.3 | 24.09x |
