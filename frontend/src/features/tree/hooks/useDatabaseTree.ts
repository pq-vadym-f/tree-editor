import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import type { NodePage, TreeNode } from '../types'

type Branch = NodePage & {
  loading: boolean
  error: string | null
}

type Row =
  | { kind: 'node'; node: TreeNode; depth: number }
  | { kind: 'page'; parentId: string | null; depth: number }

const rootBranchKey = 'root'

export function useDatabaseTree() {
  const [branchesByParentId, setBranchesByParentId] = useState(new Map<string, Branch>())
  const [expandedNodeIds, setExpandedNodeIds] = useState(new Set<string>())
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null)
  const pendingRequestsByBranchKey = useRef(new Map<string, AbortController>())

  const loadPage = useCallback(
    async (parentId: string | null, afterNodeId: string | null = null) => {
      const branchKey = parentId ?? rootBranchKey

      if (pendingRequestsByBranchKey.current.has(branchKey)) {
        return
      }

      const abortController = new AbortController()
      pendingRequestsByBranchKey.current.set(branchKey, abortController)
      setBranchesByParentId(previousBranches =>
        new Map(previousBranches).set(branchKey, {
          items: previousBranches.get(branchKey)?.items ?? [],
          nextCursor: afterNodeId,
          loading: true,
          error: null,
        }),
      )

      try {
        const childNodePage = await api.children(parentId, afterNodeId, abortController.signal)

        if (abortController.signal.aborted) {
          return
        }

        setBranchesByParentId(previousBranches =>
          new Map(previousBranches).set(branchKey, {
            items: afterNodeId
              ? [...(previousBranches.get(branchKey)?.items ?? []), ...childNodePage.items]
              : childNodePage.items,
            nextCursor: childNodePage.nextCursor,
            loading: false,
            error: null,
          }),
        )
      } catch (requestError) {
        if (abortController.signal.aborted) {
          return
        }

        setBranchesByParentId(previousBranches =>
          new Map(previousBranches).set(branchKey, {
            items: previousBranches.get(branchKey)?.items ?? [],
            nextCursor: afterNodeId,
            loading: false,
            error:
              requestError instanceof Error ? requestError.message : 'Could not load this branch.',
          }),
        )
      } finally {
        if (pendingRequestsByBranchKey.current.get(branchKey) === abortController) {
          pendingRequestsByBranchKey.current.delete(branchKey)
        }
      }
    },
    [],
  )

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    void loadPage(null)
    const activeBranchRequests = pendingRequestsByBranchKey.current

    return () => {
      activeBranchRequests.forEach(abortController => abortController.abort())
      activeBranchRequests.clear()
    }
  }, [loadPage])

  function toggleBranchExpansion(treeNode: TreeNode) {
    const nextExpandedNodeIds = new Set(expandedNodeIds)

    if (nextExpandedNodeIds.has(treeNode.id)) {
      nextExpandedNodeIds.delete(treeNode.id)
    } else {
      nextExpandedNodeIds.add(treeNode.id)

      if (!branchesByParentId.has(treeNode.id)) {
        void loadPage(treeNode.id)
      }
    }

    setExpandedNodeIds(nextExpandedNodeIds)
  }

  const visibleRows = useMemo(() => {
    const rows: Row[] = []
    const pendingRows: (Row | { kind: 'branch'; parentId: string | null; depth: number })[] = [
      { kind: 'branch', parentId: null, depth: 0 },
    ]

    while (pendingRows.length) {
      const currentRow = pendingRows.pop()!

      if (currentRow.kind === 'branch') {
        const branchState = branchesByParentId.get(currentRow.parentId ?? rootBranchKey)

        if (
          branchState?.loading ||
          branchState?.error ||
          branchState?.nextCursor ||
          !branchState?.items.length
        ) {
          pendingRows.push({ kind: 'page', parentId: currentRow.parentId, depth: currentRow.depth })
        }

        for (const treeNode of (branchState?.items ?? []).toReversed()) {
          pendingRows.push({ kind: 'node', node: treeNode, depth: currentRow.depth })
        }
      } else {
        rows.push(currentRow)

        if (currentRow.kind === 'node' && expandedNodeIds.has(currentRow.node.id)) {
          pendingRows.push({
            kind: 'branch',
            parentId: currentRow.node.id,
            depth: currentRow.depth + 1,
          })
        }
      }
    }

    return rows
  }, [branchesByParentId, expandedNodeIds])

  return {
    visibleRows,
    expandedNodeIds,
    selectedNode,
    setSelectedNode,
    toggleBranchExpansion,
    loadPage,
    getBranch: (parentId: string | null) => branchesByParentId.get(parentId ?? rootBranchKey),
  }
}
