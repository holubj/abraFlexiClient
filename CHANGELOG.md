# Changelog

All notable changes to this project will be documented in this file.

## [0.7.0] — 2026-05-20

### Added
- **Entity identity redesign** (ISSUE-22): `id` is now a server-authoritative, read-only getter on `AFEntity`. Direct assignment throws at runtime; use `api.resolveStubId()` or `api.resolve()` to obtain a confirmed id.
- **Tri-state `isNew`**: replaces the old boolean. Returns `true` (new, no server record), `undefined` (unknown — has identifiers but not yet verified), or `false` (exists — server id confirmed).
- **`api.resolve(entity)`**: resolves an entity's existence against the server via `kod` or `_stub` identifiers. Returns the same instance with `id` populated if found.
- **`api.resolveStubId(entity)`**: resolves only the numeric `id` from an identifier stub without full entity hydration.
- **`NestedUnknownStrategy`**: controls how nested entities in 'unknown' state are encoded during save — `Resolve` (default, pre-flight fetch), `ByIdentifier` (use `kod`/`ext`, no extra fetch), or `Strict` (throw on unresolved).
- Complete test suite: Layer 1 unit tests (`AFEntity` state and dirty tracking), Layer 2 API tests (save, nested encoding, resolve, resolveStubId, delete, callAction, query decode), and generator template tests.
- `flexi-clawrer` example app completely rewritten: entity browser with column picker, filter bar, pagination, and detail panel with relation navigation.

### Fixed
- `id` removed from `propAnnotations` in all 241 generated entity classes. Having it there caused a `TypeError: Cannot set property id … which has only a getter` on every `query()` call after the id getter was introduced — entities were permanently marked dirty as a secondary effect.
- `classPropertyAnnotation.ejs` generator template now skips `id`, matching the existing guard in `classProperty.ejs`. Future regeneration will not reintroduce the bug.
- Defense-in-depth guard added to `AFApiClient._decodeProperty`: silently skips any annotation whose key is `'id'`, preventing the TypeError even if a hand-edited entity retains the stale annotation.

### Breaking changes
- `entity.id` is now **read-only**. Code that previously assigned `entity.id = n` must be updated to use `entity._setId(n)` (internal/library use only) or obtain the id via `resolve()` / `resolveStubId()`.
- `entity.isNew` is now `boolean | undefined` instead of `boolean`. Code checking `=== true` or `=== false` continues to work; code checking truthiness of `isNew` to mean "definitely new" should be updated to `=== true`.
- `createIdStub()` is deprecated. Use `resolve()` or `resolveStubId()` instead.

---

## [0.6.0] — 2026-05-18

### Added
- `deleteUserRelation()` method on `AFApiClient`.
- New optional query parameters exposed on `AFQueryOptions`.
- `AFNestedEntityResolver` helper class.
- Improved `AFStitkyCache`: incremental updates, group filtering.

### Fixed
- Attachment handling in browser environments (fetch/FormData path).
- `entityPath` used correctly in `deleteUserRelation`.

---

## [0.5.6] — 2026-03-27

### Fixed
- Attachment support for browser (frontend `fetch` instead of Node `https`).
- Session initialisation when a token is passed directly.
- `DELETE` HTTP method used correctly for delete operations.

---

## [0.5.5] and earlier

- Initial `AFFilter` fluent builder.
- `save()` with basic create/update support.
- `AFApiSession` for session management.
- `ext` filter support and URL helpers.
- Generator: `yearMonth` date type, entity class scaffolding.
- Initial release.
