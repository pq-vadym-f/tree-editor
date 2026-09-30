import type { CacheRow } from '../cache'

type CachedTreeViewProps = {
  cachedTreeRows: CacheRow[]
  selectedNodeId: string | null
  disabled: boolean
  onSelect: (nodeId: string) => void
}

export function CachedTreeView({
  cachedTreeRows,
  selectedNodeId,
  disabled,
  onSelect,
}: CachedTreeViewProps) {
  return (
    <section
      className="panel"
      aria-labelledby="cache-title"
    >
      <h2 id="cache-title">CachedTreeView</h2>
      <p className="hint">
        Only loaded and newly added nodes. Missing ancestors are skipped until loaded.
      </p>

      <div
        className="tree"
        aria-label="Cached tree"
      >
        {!cachedTreeRows.length && <p className="hint">Load any database node to start editing.</p>}

        {cachedTreeRows.map(({ node, depth, missingAncestors, deleted: isNodeDeleted }) => {
          const isSelected = selectedNodeId === node.id
          let changeStatus = 'unchanged'

          if (isNodeDeleted) {
            changeStatus = 'deleted'
          } else if (node.version === null) {
            changeStatus = 'new'
          } else if (node.value !== node.originalValue) {
            changeStatus = 'modified'
          }

          return (
            <div
              key={node.id}
              className={`tree-row ${isNodeDeleted ? 'deleted' : ''}`}
              style={{ paddingLeft: Math.min(depth * 20, 320) }}
            >
              <span
                className="tree-marker"
                aria-hidden="true"
              >
                ↳
              </span>
              <button
                className={`node-label ${isSelected ? 'selected' : ''}`}
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => onSelect(node.id)}
              >
                {node.value || '(empty value)'}
              </button>
              {changeStatus !== 'unchanged' && (
                <span className={`badge ${changeStatus}`}>{changeStatus}</span>
              )}
              {missingAncestors && (
                <span
                  className="gap"
                  title="One or more ancestors are not cached"
                >
                  …
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
