# String Reference Experiment

Generated July 8, 2026 while investigating why Bunker is denser than codec on
payloads with repeated string values.

The experiment added opt-in codec variants named `codec-refs-N`, where `N` was
the minimum string length eligible for a per-message string table. The first
inline occurrence of an eligible string was stored, and later occurrences were
encoded as a table index.

## Focused Sweep

Command:

```sh
CODEC_STRING_REFERENCE_THRESHOLDS=4,8,16,32,64,128 bun ./benchmarks/index.ts --serializers codec,codec-refs-4,codec-refs-8,codec-refs-16,codec-refs-32,codec-refs-64,codec-refs-128,bunker,msgpackr-records,json
```

Summary from `/tmp/codec-string-refs-sweep-3.json`:

| Serializer | Avg bytes | Avg encode us | Avg decode us | Avg round trip us | coupon bytes | coupon round trip us |
| :-- | --: | --: | --: | --: | --: | --: |
| codec | 10,414 | 31.6 | 25.7 | 57.3 | 7,589 | 42.8 |
| codec-refs-4 | 7,067 | 45.4 | 22.3 | 67.2 | 3,005 | 53.3 |
| codec-refs-8 | 8,032 | 42.9 | 25.2 | 69.8 | 5,838 | 65.5 |
| codec-refs-16 | 9,460 | 36.6 | 31.5 | 68.0 | 7,589 | 65.1 |
| codec-refs-32 | 9,460 | 36.2 | 31.1 | 67.3 | 7,589 | 64.9 |
| codec-refs-64 | 9,460 | 35.7 | 29.8 | 66.6 | 7,589 | 57.0 |
| codec-refs-128 | 9,983 | 35.9 | 31.1 | 66.7 | 7,589 | 54.1 |
| bunker | 8,156 | 206.2 | 74.9 | 280.3 | 3,407 | 143.0 |

## Takeaways

- The coupon payload contains many repeated short strings such as `coupon`,
  `ONCE`, `EURO`, and metadata labels. A low threshold captures these and can
  beat Bunker density for that case.
- `codec-refs-4` reduced average bytes substantially and reduced coupon bytes
  from 7,589 to 3,005, but it was slower than the default codec.
- Thresholds that better match "large strings" did not improve the coupon case
  because most useful repeated strings there are short.
- The feature was removed from the production implementation because codec's
  default priority is speed, and the density win was workload-specific.
