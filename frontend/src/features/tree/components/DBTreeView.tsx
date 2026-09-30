import { memo } from 'react'
import { useDatabaseTree } from '../hooks/useDatabaseTree'

type DBTreeViewProps = {
  disabled: boolean
  cachedNodeIds: ReadonlySet<string>
  onLoad: (nodeId: string) => void
}

export const DBTreeView = memo(function DBTreeView({
  disabled,
  cachedNodeIds,
  onLoad,
}: DBTreeViewProps) {
  const {
    visibleRows,
    expandedNodeIds,
    selectedNode,
    setSelectedNode,
    toggleBranchExpansion,
    loadPage,
    getBranch,
  } = useDatabaseTree()

  function renderBranchStatus(parentId: string | null) {
    const branchState = getBranch(parentId)

    if (branchState?.loading) {
      return 'Loading…'
    }

    if (branchState?.error) {
      return (
        <>
          <span role="alert">{branchState.error}</span>{' '}
          <button
            disabled={disabled}
            onClick={() => void loadPage(parentId, branchState.nextCursor)}
          >
            Retry
          </button>
        </>
      )
    }

    if (branchState?.nextCursor) {
      return (
        <button
          disabled={disabled}
          onClick={() => void loadPage(parentId, branchState.nextCursor)}
        >
          Load more
        </button>
      )
    }

    return 'No nodes.'
  }

  return (
    <section
      className="panel"
      aria-labelledby="database-title"
    >
      <h2 id="database-title">DBTreeView</h2>
      <p className="hint">Expand a branch, select a node, then load it into the cache.</p>

      <div
        className="tree"
        aria-label="Database tree"
      >
        {visibleRows.map(treeRow => {
          if (treeRow.kind === 'page') {
            return (
              <div
                key={`page-${treeRow.parentId}`}
                className="branch-status"
                style={{ paddingLeft: Math.min(treeRow.depth * 20, 320) }}
              >
                {renderBranchStatus(treeRow.parentId)}
              </div>
            )
          }

          const { node, depth } = treeRow
          const isExpanded = expandedNodeIds.has(node.id)
          const isSelected = selectedNode?.id === node.id
          let expanderSymbol = '·'

          if (node.hasChildren) {
            expanderSymbol = isExpanded ? '−' : '+'
          }

          return (
            <div
              key={node.id}
              className="tree-row"
              style={{ paddingLeft: Math.min(depth * 20, 320) }}
            >
              <button
                className="expander"
                disabled={disabled || !node.hasChildren}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.value}`}
                aria-expanded={node.hasChildren ? isExpanded : undefined}
                onClick={() => toggleBranchExpansion(node)}
              >
                {expanderSymbol}
              </button>
              <button
                className={`node-label ${isSelected ? 'selected' : ''}`}
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => setSelectedNode(node)}
              >
                {node.value}
              </button>
              {cachedNodeIds.has(node.id) && <span className="badge">cached</span>}
            </div>
          )
        })}
      </div>

      <button
        disabled={disabled || !selectedNode || cachedNodeIds.has(selectedNode.id)}
        onClick={() => selectedNode && onLoad(selectedNode.id)}
      >
        Load selected into cache
      </button>
    </section>
  )
})
