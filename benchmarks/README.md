# Benchmarks

Benchmarks package to compare codec with other popular serializers and deserializers.

Run with:

```sh
bun run benchmark
```

The default output is a JSON report and the same report is saved to
`benchmarks/results.json`.

## CLI

```sh
bun run benchmark [--table] [--serializers <names>]
```

Options:

- `--table`: print a `console.table` summary instead of JSON.
- `--serializer <name>`: run one serializer. Can be repeated.
- `--serializers <names>`: run a comma-separated list of serializers.

The `--serializer=<name>` and `--serializers=<names>` forms are also supported.

Examples:

```sh
bun run benchmark --table
bun run benchmark --serializers codec,json,msgpackr
bun run benchmark --serializer codec --serializer avsc --table
```

Available serializers:

- `codec`
- `codec-view`
- `json`
- `bunker`
- `bunker-schema`
- `msgpackr`
- `msgpackr-records`
- `@msgpack/msgpack`
- `cbor-x`
- `avsc`
- `protobufjs`
- `@bufbuild/protobuf`
- `v8`
- `flatbuffers-flexbuffers`
- `bson`

View saved results from the repository root:

```sh
bun benchmarks.html
```
