import { DBTreeView } from './components/DBTreeView'
import { CachedTreeView } from './components/CachedTreeView'
import { NodeEditor } from './components/NodeEditor'
import { useTreeEditor } from './hooks/useTreeEditor'

export function TreeEditor() {
  const {
    cachedNodes,
    cachedNodeIds,
    cachedTreeRows,
    selectedNodeId,
    selectedNode,
    databaseTreeRevision,
    isBusy,
    statusMessage,
    errorMessage,
    pendingChanges,
    pendingChangeCount,
    hasUnsavedChanges,
    hasInvalidValues,
    isSelectedNodeDeleted,
    loadNodeIntoCache,
    applyPendingChanges,
    resetDatabaseAndCache,
    discardCachedNodes,
    editSelectedNode,
    deleteSelectedSubtree,
    restoreSelectedSubtree,
    addChildNode,
    setSelectedNodeId,
    refreshDatabaseTree,
  } = useTreeEditor()

  const exceedsChangeLimit = pendingChangeCount > 1000
  const isApplyDisabled = isBusy || !hasUnsavedChanges || hasInvalidValues || exceedsChangeLimit

  return (
    <main>
      <header>
        <h1>Tree Editor</h1>
        <p>Browse the database. Work locally. Apply when ready.</p>
      </header>

      <div className="toolbar">
        <button
          className="primary"
          disabled={isApplyDisabled}
          onClick={applyPendingChanges}
        >
          Apply all changes
        </button>
        <button
          disabled={isBusy || !cachedNodes.size}
          onClick={discardCachedNodes}
        >
          Discard cache
        </button>
        <button
          disabled={isBusy}
          onClick={refreshDatabaseTree}
        >
          Refresh DB view
        </button>
        <button
          className="danger"
          disabled={isBusy}
          onClick={resetDatabaseAndCache}
        >
          Reset sample data
        </button>
      </div>

      <p className="hint">
        {cachedNodes.size} cached · {pendingChanges.creates.length} additions ·{' '}
        {pendingChanges.updates.length} edits · {pendingChanges.deletes.length} subtree deletions
      </p>
      {exceedsChangeLimit && (
        <p className="error">
          Apply accepts at most 1,000 changes. Undo deletions, remove new nodes, or revert edits
          until at most 1,000 changes remain.
        </p>
      )}

      <div
        className="feedback"
        aria-live="polite"
      >
        {isBusy ? 'Working…' : statusMessage}
      </div>
      {errorMessage && (
        <p
          className="error"
          role="alert"
        >
          {errorMessage}
        </p>
      )}

      <div className="tree-grid">
        <DBTreeView
          key={databaseTreeRevision}
          disabled={isBusy}
          cachedNodeIds={cachedNodeIds}
          onLoad={loadNodeIntoCache}
        />
        <CachedTreeView
          cachedTreeRows={cachedTreeRows}
          selectedNodeId={selectedNodeId}
          disabled={isBusy}
          onSelect={setSelectedNodeId}
        />
      </div>

      {selectedNode ? (
        <NodeEditor
          key={selectedNode.id}
          node={selectedNode}
          deleted={isSelectedNodeDeleted}
          disabled={isBusy}
          onEdit={editSelectedNode}
          onDelete={deleteSelectedSubtree}
          onRestore={restoreSelectedSubtree}
          onAdd={addChildNode}
        />
      ) : (
        <p className="hint">
          Select a cached node to edit its value, add a child, or delete its subtree.
        </p>
      )}
    </main>
  )
}
