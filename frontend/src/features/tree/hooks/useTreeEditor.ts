import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { api } from '../api'
import { buildChanges, cacheReducer, cacheRows } from '../cache'
import type { Cache, CacheAction } from '../cache'
import { getValueError } from '../validation'

type EditorCacheState = {
  cachedNodes: Cache
  cachedNodeIds: ReadonlySet<string>
}

function reduceEditorCache(state: EditorCacheState, action: CacheAction) {
  const cachedNodes = cacheReducer(state.cachedNodes, action)

  if (cachedNodes === state.cachedNodes) {
    return state
  }

  // Each cache action only adds or only removes IDs; equal sizes preserve membership.
  const cachedNodeIds =
    cachedNodes.size === state.cachedNodes.size ? state.cachedNodeIds : new Set(cachedNodes.keys())

  return { cachedNodes, cachedNodeIds }
}

export function useTreeEditor() {
  const [{ cachedNodes, cachedNodeIds }, dispatchCacheAction] = useReducer(
    reduceEditorCache,
    undefined,
    () => ({ cachedNodes: new Map(), cachedNodeIds: new Set<string>() }),
  )
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [databaseTreeRevision, setDatabaseTreeRevision] = useState(0)
  const [isBusy, setIsBusy] = useState(false)
  const isOperationInFlight = useRef(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const cachedTreeRows = useMemo(() => cacheRows(cachedNodes), [cachedNodes])
  const pendingChanges = useMemo(
    () => buildChanges(cachedNodes, cachedTreeRows),
    [cachedNodes, cachedTreeRows],
  )
  const selectedRow = cachedTreeRows.find(row => row.node.id === selectedNodeId)
  const selectedNode = selectedRow?.node
  const isSelectedNodeDeleted = selectedRow?.deleted ?? false

  const pendingChangeCount =
    pendingChanges.creates.length + pendingChanges.updates.length + pendingChanges.deletes.length
  const hasUnsavedChanges =
    pendingChangeCount > 0 || [...cachedNodes.values()].some(cachedNode => cachedNode.deleted)
  const hasInvalidValues = [...pendingChanges.creates, ...pendingChanges.updates].some(
    nodeChange => getValueError(nodeChange.value) !== null,
  )

  useEffect(() => {
    if (!hasUnsavedChanges) {
      return
    }

    const warnAboutUnsavedChanges = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warnAboutUnsavedChanges)

    return () => window.removeEventListener('beforeunload', warnAboutUnsavedChanges)
  }, [hasUnsavedChanges])

  const runEditorOperation = useCallback(async (editorOperation: () => Promise<void>) => {
    if (isOperationInFlight.current) {
      return
    }

    isOperationInFlight.current = true
    setIsBusy(true)
    setErrorMessage('')
    setStatusMessage('')

    try {
      await editorOperation()
    } catch (operationError) {
      setErrorMessage(
        operationError instanceof Error
          ? operationError.message
          : 'The request failed. Your cache was kept.',
      )
    } finally {
      isOperationInFlight.current = false
      setIsBusy(false)
    }
  }, [])

  const loadNodeIntoCache = useCallback(
    (nodeId: string) => {
      void runEditorOperation(async () => {
        const cachedNode = await api.load(nodeId)
        dispatchCacheAction({ type: 'load', node: cachedNode })
        setSelectedNodeId(nodeId)
        setStatusMessage(`Loaded “${cachedNode.value}” into the cache.`)
      })
    },
    [runEditorOperation],
  )

  function applyPendingChanges() {
    void runEditorOperation(async () => {
      const applyResult = pendingChangeCount
        ? await api.apply(pendingChanges)
        : { versions: [], deletedCount: 0 }

      dispatchCacheAction({ type: 'applied', result: applyResult })

      if (isSelectedNodeDeleted) {
        setSelectedNodeId(null)
      }

      if (pendingChangeCount) {
        setDatabaseTreeRevision(currentRevision => currentRevision + 1)
      }

      setStatusMessage(`Changes applied. ${applyResult.deletedCount} database node(s) deleted.`)
    })
  }

  function resetDatabaseAndCache() {
    if (!window.confirm('Restore the sample database and discard every cached change?')) {
      return
    }

    void runEditorOperation(async () => {
      await api.reset()

      dispatchCacheAction({ type: 'clear' })
      setSelectedNodeId(null)
      setDatabaseTreeRevision(currentRevision => currentRevision + 1)
      setStatusMessage('Database and cache reset to the initial sample.')
    })
  }

  function discardCachedNodes() {
    if (hasUnsavedChanges && !window.confirm('Discard all cached nodes and pending changes?')) {
      return
    }

    dispatchCacheAction({ type: 'clear' })
    setSelectedNodeId(null)
    setErrorMessage('')
    setStatusMessage('Cache cleared. Database unchanged.')
  }

  function editSelectedNode(nodeValue: string) {
    if (selectedNode) {
      dispatchCacheAction({ type: 'edit', id: selectedNode.id, value: nodeValue })
    }
  }

  function deleteSelectedSubtree() {
    if (selectedNode) {
      dispatchCacheAction({ type: 'delete', id: selectedNode.id })
    }
  }

  function restoreSelectedSubtree() {
    if (selectedNode) {
      dispatchCacheAction({ type: 'restore', id: selectedNode.id })
    }
  }

  function addChildNode(nodeValue: string) {
    if (!selectedNode) {
      return
    }

    const nodeId = crypto.randomUUID()
    dispatchCacheAction({ type: 'add', parentId: selectedNode.id, id: nodeId, value: nodeValue })
    setSelectedNodeId(nodeId)
  }

  return {
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
    refreshDatabaseTree: () => setDatabaseTreeRevision(currentRevision => currentRevision + 1),
  }
}
