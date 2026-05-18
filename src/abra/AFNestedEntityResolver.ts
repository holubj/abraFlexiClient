import { AFQueryOptions } from './AFTypes.js'
import { AFFilter } from './AFFilter.js'
import { AFError, AFErrorCode } from './AFError.js'

// Resolves the URL path prefix needed to scope a query to a parent entity.
// E.g. `individualni-cenik` of a given firma lives under `adresar/<id>/individualni-cenik`.
// Returns '' (empty prefix) when the entity is queried at top level.
//
// To support a new nested entity, add a case below that reads the
// entity-specific selector(s) from `AFQueryOptions` and returns the prefix
// (must end with '/').
export function resolveNestedEntityPathPrefix(
  entityPath: string,
  options: AFQueryOptions
): string {
  switch (entityPath) {
    case 'individualni-cenik': {
      const sel = serializeParentSelector(options.adresarId, 'adresarId', entityPath)
      if (sel === undefined) return ''
      return `adresar/${sel}/`
    }
    default:
      return ''
  }
}

// Converts a parent selector (numeric id, id-as-string, or AFFilter from
// ID()/CODE()/EXT()) into the URL path component Abra expects.
// Returns undefined when the selector is not provided.
function serializeParentSelector(
  value: number | string | AFFilter | undefined | null,
  optionName: string,
  entityPath: string
): string | undefined {
  if (value === undefined || value === null) return undefined

  if (value instanceof AFFilter) {
    const piece = value.toUrlComponent()
    if (!piece.length) {
      throw new AFError(
        AFErrorCode.MISSING_ID,
        `'${optionName}' for ${entityPath} resolved to empty URL component.`
      )
    }
    return piece
  }

  if (typeof value === 'string' && !value.length) {
    throw new AFError(
      AFErrorCode.MISSING_ID,
      `'${optionName}' for ${entityPath} must be a non-empty id.`
    )
  }

  return String(value)
}
