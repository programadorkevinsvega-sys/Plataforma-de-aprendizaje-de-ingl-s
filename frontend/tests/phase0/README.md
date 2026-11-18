# Frontend Phase 0 baseline tests

These tests use Node's built-in test runner and TypeScript type stripping. They do
not add a second frontend package manager or alter the production dependency lock.

Run from `frontend/` with Node 24:

```sh
node --experimental-strip-types \
  --experimental-test-coverage \
  --experimental-loader ./tests/phase0/ts-path-loader.mjs \
  --test-coverage-include='src/domain/**/*.ts' \
  --test-coverage-include='src/application/**/*.ts' \
  --test-coverage-include='src/infrastructure/**/*.ts' \
  --test-coverage-include='src/shared/**/*.ts' \
  --test tests/phase0/*.test.mjs
```

The source-import test loads every non-UI TypeScript module under domain,
application, infrastructure and shared. The behavior tests cover representative
authentication validation, domain isolation, DTO mapping, error presentation
and class-name merging.

The initial report intentionally excludes Next.js route components and React
TSX presentation files. Those require a DOM/component or browser E2E strategy;
their coverage is not inferred from a successful Next.js build.
