# Codec Benchmarks

65 rows from 5 cases, generated 6/29/2026, 4:06:06 PM.

Each serializer is tested on the same case payloads over repeated encode and decode runs, using median timings from the saved benchmark report.

## Average results

Mean values across all benchmark cases.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥈 10,414 | 🥈 0.47x | 🥇 19.3 | 🥇 21.1 | 🥇 40.9 | 🥇 0.60x |
| msgpackr-records 🥈 | MessagePack | 10,724 | 0.49x | 🥉 28.3 | 37.8 | 🥈 66.3 | 🥈 0.97x |
| avsc 🥉 | Avro | 🥉 10,616 | 🥉 0.48x | 32.2 | 🥉 36.3 | 🥉 68.0 | 🥉 0.99x |
| json | JSON text | 21,934 | 1.00x | 🥈 24.2 | 44.4 | 68.7 | 1.00x |
| v8 | V8 serialized value | 24,052 | 1.10x | 54.1 | 🥈 32.7 | 87.1 | 1.27x |
| msgpackr | MessagePack | 16,788 | 0.77x | 35.4 | 67.6 | 103.0 | 1.50x |
| cbor-x | CBOR | 17,139 | 0.78x | 31.5 | 70.2 | 105.9 | 1.54x |
| @msgpack/msgpack | MessagePack | 16,475 | 0.75x | 56.6 | 103.2 | 160.2 | 2.33x |
| bunker | Bunker | 🥇 8,156 | 🥇 0.37x | 148.0 | 56.7 | 204.5 | 2.98x |
| bson | BSON | 27,199 | 1.24x | 88.6 | 147.1 | 234.8 | 3.42x |
| flatbuffers-flexbuffers | FlexBuffers | 11,893 | 0.54x | 232.6 | 201.6 | 430.3 | 6.26x |
| protobufjs | Protocol Buffers Struct | 33,671 | 1.54x | 225.6 | 220.9 | 447.6 | 6.52x |
| @bufbuild/protobuf | Protocol Buffers Struct | 33,671 | 1.54x | 1098.7 | 1156.0 | 2251.2 | 32.77x |

## profile

One medium nested object with strings, numbers, booleans, arrays, and maps.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥇 803 | 🥇 0.74x | 🥈 0.94 | 🥇 1.02 | 🥇 1.96 | 🥇 0.95x |
| json 🥈 | JSON text | 1,082 | 1.00x | 🥇 0.74 | 🥈 1.28 | 🥈 2.06 | 🥈 1.00x |
| avsc 🥉 | Avro | 🥈 806 | 🥈 0.74x | 🥉 1.13 | 3.29 | 🥉 4.41 | 🥉 2.14x |
| msgpackr | MessagePack | 949 | 0.88x | 1.25 | 3.35 | 4.60 | 2.23x |
| v8 | V8 serialized value | 1,266 | 1.17x | 2.49 | 🥉 2.34 | 4.86 | 2.35x |
| @msgpack/msgpack | MessagePack | 🥉 943 | 🥉 0.87x | 1.83 | 3.44 | 5.32 | 2.58x |
| cbor-x | CBOR | 957 | 0.88x | 1.18 | 4.34 | 5.54 | 2.69x |
| msgpackr-records | MessagePack | 955 | 0.88x | 1.64 | 4.14 | 5.79 | 2.81x |
| bson | BSON | 1,127 | 1.04x | 3.02 | 6.47 | 9.36 | 4.54x |
| bunker | Bunker | 978 | 0.90x | 5.90 | 8.97 | 14.9 | 7.23x |
| protobufjs | Protocol Buffers Struct | 1,369 | 1.27x | 7.10 | 8.07 | 15.1 | 7.33x |
| flatbuffers-flexbuffers | FlexBuffers | 1,134 | 1.05x | 18.4 | 9.33 | 27.5 | 13.33x |
| @bufbuild/protobuf | Protocol Buffers Struct | 1,369 | 1.27x | 32.6 | 32.6 | 64.9 | 31.49x |

## coupon-batch

A batch of compact, repeated payment-style records inspired by avsc's Coupon benchmark.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 7,589 | 0.35x | 🥇 11.4 | 🥇 15.0 | 🥇 26.0 | 🥇 0.54x |
| msgpackr-records 🥈 | MessagePack | 🥈 6,125 | 🥈 0.28x | 🥈 19.7 | 25.3 | 🥈 45.1 | 🥈 0.94x |
| json 🥉 | JSON text | 21,658 | 1.00x | 🥉 20.2 | 28.0 | 🥉 48.1 | 🥉 1.00x |
| v8 | V8 serialized value | 12,667 | 0.58x | 42.2 | 🥉 24.8 | 66.6 | 1.39x |
| avsc | Avro | 🥉 6,927 | 🥉 0.32x | 30.2 | 41.9 | 71.5 | 1.49x |
| bunker | Bunker | 🥇 3,407 | 🥇 0.16x | 63.3 | 🥈 21.5 | 85.0 | 1.77x |
| msgpackr | MessagePack | 16,687 | 0.77x | 31.1 | 71.2 | 103.2 | 2.15x |
| cbor-x | CBOR | 16,713 | 0.77x | 30.4 | 83.6 | 113.8 | 2.37x |
| @msgpack/msgpack | MessagePack | 16,429 | 0.76x | 39.5 | 87.8 | 127.5 | 2.65x |
| bson | BSON | 21,044 | 0.97x | 54.9 | 168.9 | 223.2 | 4.64x |
| protobufjs | Protocol Buffers Struct | 26,112 | 1.21x | 180.7 | 191.3 | 372.5 | 7.75x |
| flatbuffers-flexbuffers | FlexBuffers | 8,108 | 0.37x | 171.8 | 207.9 | 380.6 | 7.92x |
| @bufbuild/protobuf | Protocol Buffers Struct | 26,112 | 1.21x | 745.6 | 767.3 | 1513.3 | 31.49x |

## task-board

A collection-like object with nested records and repeated child objects.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥉 23,664 | 🥉 0.62x | 🥇 27.1 | 🥇 36.9 | 🥇 64.0 | 🥇 0.71x |
| avsc 🥈 | Avro | 23,917 | 0.63x | 43.4 | 🥉 46.6 | 🥈 89.1 | 🥈 0.98x |
| msgpackr-records 🥉 | MessagePack | 24,130 | 0.63x | 🥉 40.3 | 50.2 | 🥉 90.1 | 🥉 0.99x |
| json | JSON text | 38,080 | 1.00x | 🥈 30.1 | 61.1 | 90.7 | 1.00x |
| v8 | V8 serialized value | 31,417 | 0.83x | 77.1 | 🥈 42.7 | 120.6 | 1.33x |
| msgpackr | MessagePack | 32,949 | 0.87x | 45.7 | 90.1 | 136.0 | 1.50x |
| cbor-x | CBOR | 33,050 | 0.87x | 44.3 | 103.4 | 167.7 | 1.85x |
| bunker | Bunker | 🥇 14,668 | 🥇 0.39x | 196.7 | 81.3 | 278.3 | 3.07x |
| @msgpack/msgpack | MessagePack | 32,453 | 0.85x | 78.9 | 204.8 | 284.9 | 3.14x |
| bson | BSON | 42,103 | 1.11x | 100.0 | 233.6 | 329.3 | 3.63x |
| protobufjs | Protocol Buffers Struct | 45,372 | 1.19x | 257.0 | 275.2 | 533.3 | 5.88x |
| flatbuffers-flexbuffers | FlexBuffers | 🥈 21,275 | 🥈 0.56x | 313.0 | 292.0 | 604.6 | 6.67x |
| @bufbuild/protobuf | Protocol Buffers Struct | 45,372 | 1.19x | 1147.1 | 1261.8 | 2408.9 | 26.56x |

## vector-tile

A vector-tile style payload with nested arrays and many small unsigned integers.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥇 7,995 | 🥇 0.34x | 🥇 36.4 | 🥇 21.2 | 🥇 58.2 | 🥇 0.50x |
| avsc 🥈 | Avro | 🥉 9,356 | 🥉 0.40x | 47.5 | 🥈 38.9 | 🥈 87.1 | 🥈 0.74x |
| msgpackr-records 🥉 | MessagePack | 9,727 | 0.42x | 44.7 | 59.2 | 🥉 103.9 | 🥉 0.89x |
| cbor-x | CBOR | 13,932 | 0.60x | 🥈 40.3 | 71.0 | 111.3 | 0.95x |
| bunker | Bunker | 🥈 8,293 | 🥈 0.36x | 65.0 | 🥉 51.9 | 116.7 | 0.99x |
| json | JSON text | 23,196 | 1.00x | 🥉 43.3 | 73.9 | 117.4 | 1.00x |
| msgpackr | MessagePack | 12,413 | 0.54x | 48.4 | 86.9 | 134.7 | 1.15x |
| v8 | V8 serialized value | 50,648 | 2.18x | 81.9 | 52.5 | 135.3 | 1.15x |
| @msgpack/msgpack | MessagePack | 12,027 | 0.52x | 100.5 | 57.9 | 158.2 | 1.35x |
| bson | BSON | 44,061 | 1.90x | 203.8 | 128.0 | 331.5 | 2.83x |
| flatbuffers-flexbuffers | FlexBuffers | 13,074 | 0.56x | 278.8 | 239.9 | 519.1 | 4.42x |
| protobufjs | Protocol Buffers Struct | 62,651 | 2.70x | 375.4 | 341.7 | 715.5 | 6.10x |
| @bufbuild/protobuf | Protocol Buffers Struct | 62,651 | 2.70x | 2548.8 | 2681.0 | 5229.8 | 44.56x |

## search-index

A large object with a long string snapshot, arrays, and a large string-keyed index.

| Serializer | Format | Bytes | Size vs JSON | Encode µs | Decode µs | Round trip µs | Round trip vs JSON |
| :-- | :-- | --: | --: | --: | --: | --: | --: |
| codec 🥇 | codec binary | 🥇 12,018 | 🥇 0.47x | 🥇 20.9 | 🥇 31.2 | 🥇 54.6 | 🥇 0.64x |
| json 🥈 | JSON text | 25,656 | 1.00x | 🥈 26.7 | 57.5 | 🥈 85.3 | 🥈 1.00x |
| msgpackr-records 🥉 | MessagePack | 🥉 12,684 | 🥉 0.49x | 🥉 35.3 | 🥉 50.1 | 🥉 86.8 | 🥉 1.02x |
| avsc | Avro | 🥈 12,072 | 🥈 0.47x | 38.5 | 50.9 | 88.0 | 1.03x |
| v8 | V8 serialized value | 24,261 | 0.95x | 66.6 | 🥈 41.3 | 107.9 | 1.26x |
| cbor-x | CBOR | 21,042 | 0.82x | 41.5 | 88.9 | 131.0 | 1.54x |
| msgpackr | MessagePack | 20,942 | 0.82x | 50.4 | 86.2 | 136.5 | 1.60x |
| @msgpack/msgpack | MessagePack | 20,522 | 0.80x | 62.3 | 161.9 | 225.2 | 2.64x |
| bson | BSON | 27,660 | 1.08x | 81.5 | 198.4 | 280.4 | 3.29x |
| bunker | Bunker | 13,435 | 0.52x | 409.4 | 119.9 | 527.4 | 6.18x |
| protobufjs | Protocol Buffers Struct | 32,851 | 1.28x | 307.7 | 288.1 | 601.6 | 7.05x |
| flatbuffers-flexbuffers | FlexBuffers | 15,875 | 0.62x | 381.3 | 258.9 | 619.5 | 7.26x |
| @bufbuild/protobuf | Protocol Buffers Struct | 32,851 | 1.28x | 1019.7 | 1037.4 | 2039.1 | 23.90x |
