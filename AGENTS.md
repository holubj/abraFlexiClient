# AGENTS.md — ABRA Flexi TypeScript Client

This file documents the project structure, conventions, and invariants that an AI coding agent must understand before making changes.

---

## Project overview

`abra-flexi` is a TypeScript client library for the [ABRA Flexi](https://www.abra.eu/en/flexi/) REST API — a Czech ERP/accounting SaaS. The library runs in both browsers and Node.js, supports the full CRUD surface of the API, and ships as dual ESM + CJS. A companion code-generator CLI introspects the live API and produces the ~200 typed entity classes found in `src/generated/`.

The library is still pre-1.0 and its public API is not yet stable.

---

## Repository layout

```
src/
  abra/            Core library: client, entity base class, filter DSL, types, helpers
  generated/       Auto-generated code — DO NOT edit by hand (see below)
    entities/      One file per ABRA Flexi "evidence" (e.g. AFFakturaVydana.ts)
    AFEntityEnums.ts      All enum types
    AFEntityRegistry.ts   Path/name → class map
  helpers/
    urlHelper.ts   Low-level URL parameter helpers
  index.ts         Public API surface (re-exports)

generator/         Code generator CLI (TypeScript)
  generator.ts     Main logic: fetches API metadata, runs EJS templates
  fix.ts           Post-generation property patches
  templates/       EJS templates for class, enum, registry, and index files
  types.ts         Generator-internal types

bin/               Compiled generator (output of `npm run build:gen`) — not committed to source control
dist/              Compiled library (output of `npm run build`) — not committed to source control

examples/          Runnable ts-node examples
```

---

## Essential commands

| Task | Command |
|---|---|
| Build library | `npm run build` |
| Build generator CLI | `npm run build:gen` |
| Regenerate entity classes | `npm run generate` (requires a live Flexi server) |
| Run tests | `npx jest` (or `npm test` if wired up) |
| Run a single example | `ts-node examples/loadEntity.ts -s <server> -c <company> -u <user> -h <pass>` |

Build pipeline: `npm run build` runs `rimraf dist` then `tsdown` (config in `tsdown.config.ts`), which compiles `src/index.ts` into `dist/index.mjs` (ESM) and `dist/index.cjs` (CJS) with `.d.ts` declarations.

Test config is in `jestconfig.json`; test files match `**/*.spec.ts` or `**/*.test.ts` or files inside `__tests__/`. `ts-jest` handles TypeScript transformation.

---

## Generated code — never edit by hand

Everything under `src/generated/` is produced by the generator and **must not be edited manually**. Changes will be overwritten on the next `npm run generate` run.

If a generated entity class has a wrong or missing property, fix it in `generator/fix.ts` using `FixProperties()`, which applies patches after the template is rendered.

The generator flow:
1. Fetch `evidence-list.json` from the live Flexi server.
2. For each evidence, fetch `<path>/properties.json` and `<path>/relations.json`.
3. Render `generator/templates/classFile.ejs` → `src/generated/entities/AF<EvidenceName>.ts`.
4. Render enum, registry, and index files.

---

## Core abstractions

### `AFApiClient` (`src/abra/AFApiClient.ts`)

The single entry point for all API calls. Constructed with `AFApiConfig` (at minimum `url` and `company`). All public methods are async.

Key methods:
- `query(EntityClass, options)` → `InstanceType<T>[]`
- `queryOne(EntityClass, options)` → `InstanceType<T>`
- `queryRaw(entityPath, options)` → raw JSON
- `queryFile(EntityClass, format, options)` → `AFFileResult` (for PDF/CSV/ISDOC etc.)
- `populate(entities, options)` → refresh existing instances with more detail
- `queryURels(relatedEntity, forObjects, options)` → resolve user-relation links
- `save(entity, options)` → create or update
- `delete(entity, options)` → remove
- `callEntityAction(entity, actionName, options)` → trigger a named Abra action
- `create(EntityClass)` → new empty in-memory instance
- `createIdStub(EntityClass, idStub)` → reference an existing Abra record by id/kod without fetching it

The client wraps every outbound request with a level-filtered logger (see `makeFilteringLogger`). Default: silent. Pass `logger` and/or `logLevel` in config.

### `AFEntity` (`src/abra/AFEntity.ts`)

Base class for all generated entity classes. Key fields and behaviour:

- `id?: number | null`, `kod?: string | null`, `stitky?: string | null` — universal ABRA identifiers.
- `_isNew: boolean` — `true` until the entity is confirmed to exist on the server. **Setting `id` manually does NOT clear this flag.** Use `createIdStub()` to reference existing records.
- `_orig: Record<string, any>` — snapshot of server-loaded values; used for change detection.
- `hasChanged(key?)` — returns `true` if the field (or any field) has diverged from `_orig`.
- `changedKeys()` — returns only the keys that have changed; the client uses this to build a minimal PUT body.
- `propAnnotations` — static class-level map from property name to `TypeAnnotation`; populated by generated classes via decorators/assignments.

Never construct `AFEntity` subclasses directly in application code. Always use `api.create()` or `api.createIdStub()` so the `AFStitkyCache` reference is properly injected.

### `AFFilter` / filter DSL (`src/abra/AFFilter.ts`)

Immutable builder for ABRA FLEX filter expressions. All methods return a new instance.

```typescript
import { Filter, ID, CODE, EXT, AFFilterFn } from 'abra-flexi'

Filter(`typDokl = '::td' and datum > :from`, { td: 'MY_TYPE', from: new Date() })
ID(42)            // numeric id selector
CODE('MY_CODE')   // code: prefix selector
EXT('ext-id')     // ext: prefix selector

Filter().and('stav = :s', { s: 'ZAUCTOVANO' }).or('stav = :s', { s: 'UHRAZENO' })
filter.use(otherFilter, 'or')   // embed sub-filter with parens
filter.useNot(otherFilter)       // prepend `not` before parens
```

Placeholder rules:
- `:key` — substituted as a literal value (quoted string, number, date, etc.)
- `::key` — same but prefixes scalar strings with `code:` (for Abra code identifiers)
- Both support arrays (joined with `,`) and `AFEntity` instances (resolved to `id` or `code:<kod>`).
- If a placeholder resolves to `null`/`undefined` or an empty array, the entire condition is silently dropped (no partial filters are emitted).

### `AFTypes.ts`

Canonical location for all shared types. Notable:

- `AFApiConfig` — constructor config for `AFApiClient`.
- `AFQueryOptions` — options shared across `query`, `queryOne`, `populate`, `queryURels`. Includes `detail`, `filter`, `limit`, `start`, and various ABRA-specific boolean flags. Also carries `adresarId` for scoping nested entities (see `AFNestedEntityResolver`).
- `AFQueryDetail` — `FULL | SUMMARY | ID` enum; `SUMMARY` is the default.
- `AFNestedDetail` — recursive array type: `(string | [string, AFNestedDetail])[]` for specifying which relations to include in a response.
- `StitkyCacheStrategy` — `None | Lazy (default) | Eager`.
- `AFResponseFormat` — `'json' | 'pdf' | 'html' | 'csv' | 'isdoc' | ...`

### `AFStitkyCache` (`src/abra/AFStitkyCache.ts`)

Maintains an in-memory cache of `AFStitek` (tag) and `AFSkupinaStitku` (tag group) instances shared across all queries on a given client. Automatically kept fresh via a debounced `fetchTick()` called after every query/populate/save. Set `noUpdateStitkyCache: true` on inner queries to avoid infinite loops.

### `AFApiSession` (`src/abra/AFApiSession.ts`)

Optional authentication layer. Wraps `AFApiClient` and provides session-cookie–based login/logout against the Flexi auth endpoint. Use when HTTP Basic credentials are not desirable.

### `AFNestedEntityResolver` (`src/abra/AFNestedEntityResolver.ts`)

Handles entities that are scoped under a parent in the URL (e.g. `adresar/<id>/individualni-cenik`). When a new nested evidence is added, add a `case` here that extracts the parent selector from `AFQueryOptions` and returns the appropriate path prefix.

---

## Key conventions

### Serialisation / deserialisation

`AFDataType.ts` contains `parsePropertyValue` (server JSON → TypeScript) and `serializePropertyValue` (TypeScript → JSON for PUT). Dates and `Big.js` numeric types have custom logic. Always route new scalar types through these functions.

### Saving entities

The `save()` method only serialises keys returned by `changedKeys()`. For collections (1:N relations), the entire array is sent with `<key>@removeAll: true` — meaning the server replaces the full set. For to-1 relations, only the id or `code:<kod>` is sent.

The `_isNew` flag controls whether `uzivatelske-vazby` are allowed in the same PUT (they are not supported by ABRA Flexi for new records; the error message in `AFApiClient.save()` explains the workaround).

After a successful save, the server-assigned `id` is extracted from `winstrom.results[].ref` and applied back to the entity.

### Deleting user relations (`AFUzivatelskaVazba`)

Standard DELETE is not supported by the ABRA API for this entity. `AFApiClient.delete()` automatically sets `asUserRelation: true` for `AFUzivatelskaVazba` instances, which switches the HTTP method to PUT with `@action: 'delete'`.

### Error handling

All errors thrown by the library are instances of `AFError`. The `code` property is an `AFErrorCode` enum value — use it for programmatic error handling. The string message includes the code as a prefix for readability.

---

## Adding new features — checklist

1. **New top-level entity (evidence)** — regenerate with `npm run generate`. Only write manual code when the generator cannot model the entity correctly; fix such cases in `generator/fix.ts`.

2. **New nested entity type** — add a `case` to `resolveNestedEntityPathPrefix()` in `AFNestedEntityResolver.ts` and a corresponding selector field to `AFQueryOptions` in `AFTypes.ts`.

3. **New query parameter** — add it to `AFQueryOptions` (and `AFQueryFileOptions` if relevant), then wire it up in `_buildQueryUrl` in `AFApiClient.ts` via `addParamToUrl(url, 'param-name', options.paramName)`.

4. **New scalar type** — add a `PropertyType` enum value, handle it in `parsePropertyValue` and `serializePropertyValue` in `AFDataType.ts`, and update `generateType()` in `generator/generator.ts`.

5. **New public export** — add it to `src/index.ts`.

---

## Things to watch out for

- **Czech property names everywhere.** The ABRA Flexi API uses Czech identifiers for all evidences and their properties (e.g. `faktura-vydana`, `typDokl`, `uzivatelske-vazby`). These appear verbatim in entity classes, filter expressions, and URL paths. This is intentional and correct.
- **Do not use `new AnyAFEntitySubclass()`** in application or test code without a proper `AFStitkyCache` instance. Always go through `api.create()` / `api.createIdStub()`.
- **`_isNew` is not cleared by setting `id`** — only by `createIdStub()`, by decoding a server response, or by a successful `save()`.
- **`populate()` / `populateOne()`** merge only the fields present in the response into the existing instance (same object reference, returns `true` from `===` checks). They do not create new instances.
- **`queryURels()`** only resolves relations that are already present on `uzivatelske-vazby`; it does not re-fetch the source entities' user-relation lists.
- **The `fetch` option in `AFApiConfig`** allows injecting a custom fetch implementation (e.g. one that attaches auth headers or adds retry logic) — useful for session-based auth without using `AFApiSession`.
- **`dist/` and `bin/` are build outputs** — never commit them; they are excluded from the npm package via `.npmignore`.
