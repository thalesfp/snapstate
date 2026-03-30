# Benchmarks

Results from `npm run bench` using [Vitest bench](https://vitest.dev/guide/features.html#benchmarking) on Node.js with jsdom.

## Core

### store.get

| Operation | ops/sec | mean |
|---|---|---|
| full snapshot | 15,118,491 | 0.07&micro;s |
| shallow path (depth 1) | 6,750,006 | 0.15&micro;s |
| deep path (depth 5) | 531,300 | 1.9&micro;s |

### store.set

| Operation | ops/sec | mean |
|---|---|---|
| single shallow set (autoBatch) | 2,527,953 | 0.4&micro;s |
| depth 1 (sync notify) | 1,611,041 | 0.6&micro;s |
| depth 10 (sync notify) | 287,595 | 3.5&micro;s |

### store.batch

| Operation | ops/sec | mean |
|---|---|---|
| 100 individual sets | 43,965 | 22.7&micro;s |
| batch 100 sets | 40,924 | 24.4&micro;s |

### Subscription trie

| Operation | ops/sec | mean |
|---|---|---|
| notify (10 child subscribers) | 2,073,600 | 0.5&micro;s |
| notify (1000 child subscribers) | 35,017 | 28.6&micro;s |
| notify depth 1 | 4,086,985 | 0.2&micro;s |
| notify depth 8 | 2,574,336 | 0.4&micro;s |
| add + remove | 531,781 | 1.9&micro;s |

### Structural sharing

| Operation | ops/sec | mean |
|---|---|---|
| no-op (same value) | 5,891,694 | 0.2&micro;s |
| shallow object (3 keys) | 2,667,902 | 0.4&micro;s |
| deep object (depth 10) | 383,709 | 2.6&micro;s |
| wide object (100 keys) | 47,365 | 21.1&micro;s |

### Computed

| Operation | ops/sec | mean |
|---|---|---|
| cache hit (no deps changed) | 14,578,273 | 0.07&micro;s |
| recompute after dep change | 1,108,594 | 0.9&micro;s |

### End-to-end: set + notify

| Operation | ops/sec | mean |
|---|---|---|
| 1 subscriber | 1,147,989 | 0.9&micro;s |
| 10 subscribers on path | 632,611 | 1.6&micro;s |

### Store creation

| Operation | ops/sec | mean |
|---|---|---|
| create store | 133,035 | 7.5&micro;s |
| create + destroy | 129,321 | 7.7&micro;s |

## React

### connect vs scoped

Full mount + unmount cycle including store creation/destruction.

| Scenario | connect | scoped | diff |
|---|---|---|---|
| mount + unmount | 525 ops/s (1.90ms) | 561 ops/s (1.78ms) | ~identical |
| mount + update + unmount | 513 ops/s (1.95ms) | 524 ops/s (1.91ms) | ~identical |
| mount + fetch + unmount | 528 ops/s (1.90ms) | 505 ops/s (1.98ms) | ~identical |

### Template overhead

| Scenario | without template | with template | diff |
|---|---|---|---|
| mount + unmount | 593 ops/s (1.69ms) | 589 ops/s (1.70ms) | ~0% |
| mount + update + unmount | 538 ops/s (1.86ms) | 538 ops/s (1.86ms) | ~0% |
