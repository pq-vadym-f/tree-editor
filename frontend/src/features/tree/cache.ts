import type { ApplyResult, Changes, LoadedNode } from './types.ts'

export type CacheNode = Omit<LoadedNode, 'version'> & {
  version: number | null
  originalValue: string | null
  deleted: boolean
}

export type Cache = ReadonlyMap<string, CacheNode>

export type CacheAction =
  | { type: 'load'; node: LoadedNode }
  | { type: 'edit'; id: string; value: string }
  | { type: 'add'; parentId: string; id: string; value: string }
  | { type: 'delete'; id: string }
  | { type: 'restore'; id: string }
  | { type: 'applied'; result: ApplyResult }
  | { type: 'clear' }

export function isDeleted(cachedNodes: Cache, node: CacheNode): boolean {
  return node.deleted || node.ancestorIds.some(ancestorId => cachedNodes.get(ancestorId)?.deleted)
}

export function cacheReducer(cachedNodes: Cache, cacheAction: CacheAction): Cache {
  if (cacheAction.type === 'clear') {
    return new Map()
  }

  if (cacheAction.type === 'load') {
    if (cachedNodes.has(cacheAction.node.id)) {
      return cachedNodes
    }

    return new Map(cachedNodes).set(cacheAction.node.id, {
      ...cacheAction.node,
      originalValue: cacheAction.node.value,
      deleted: false,
    })
  }

  if (cacheAction.type === 'applied') {
    const committedVersionsByNodeId = new Map(
      cacheAction.result.versions.map(node => [node.id, node.version]),
    )

    return new Map(
      cacheRows(cachedNodes)
        .filter(row => !row.deleted)
        .map(({ node }) => [
          node.id,
          {
            ...node,
            originalValue: node.value,
            version: committedVersionsByNodeId.get(node.id) ?? node.version,
          },
        ]),
    )
  }

  const node = cachedNodes.get(cacheAction.type === 'add' ? cacheAction.parentId : cacheAction.id)

  if (!node) {
    return cachedNodes
  }

  if (cacheAction.type === 'restore') {
    return node.deleted
      ? new Map(cachedNodes).set(node.id, { ...node, deleted: false })
      : cachedNodes
  }

  if (isDeleted(cachedNodes, node)) {
    return cachedNodes
  }

  const updatedCache = new Map(cachedNodes)

  switch (cacheAction.type) {
    case 'edit':
      updatedCache.set(node.id, { ...node, value: cacheAction.value })
      break

    case 'delete':
      updatedCache.set(node.id, { ...node, deleted: true })
      break

    case 'add':
      if (cachedNodes.has(cacheAction.id)) {
        return cachedNodes
      }

      updatedCache.set(cacheAction.id, {
        id: cacheAction.id,
        parentId: node.id,
        value: cacheAction.value,
        originalValue: null,
        version: null,
        ancestorIds: [...node.ancestorIds, node.id],
        deleted: false,
      })
      break
  }

  return updatedCache
}

export function buildChanges(cachedNodes: Cache, rows = cacheRows(cachedNodes)): Changes {
  const pendingChanges: Changes = { creates: [], updates: [], deletes: [] }

  for (const { node, deleted, ancestorDeleted } of rows) {
    if (deleted) {
      if (node.version !== null && node.deleted && !ancestorDeleted) {
        pendingChanges.deletes.push({ id: node.id, version: node.version })
      }
    } else if (node.version === null) {
      pendingChanges.creates.push({ id: node.id, parentId: node.parentId!, value: node.value })
    } else if (node.value !== node.originalValue) {
      pendingChanges.updates.push({ id: node.id, version: node.version, value: node.value })
    }
  }

  return pendingChanges
}

export type CacheRow = {
  node: CacheNode
  depth: number
  missingAncestors: boolean
  deleted: boolean
  ancestorDeleted: boolean
}

export function cacheRows(cachedNodes: Cache): CacheRow[] {
  const childrenByCachedParentId = new Map<string | null, CacheNode[]>()

  for (const node of cachedNodes.values()) {
    const nearestCachedAncestorId =
      node.ancestorIds.findLast(ancestorId => cachedNodes.has(ancestorId)) ?? null
    const cachedSiblings = childrenByCachedParentId.get(nearestCachedAncestorId) ?? []

    cachedSiblings.push(node)
    childrenByCachedParentId.set(nearestCachedAncestorId, cachedSiblings)
  }

  const pendingRows = (childrenByCachedParentId.get(null) ?? [])
    .toReversed()
    .map(node => ({ node, depth: 0, ancestorDeleted: false }))
  const visibleRows: CacheRow[] = []

  while (pendingRows.length) {
    const currentRow = pendingRows.pop()!

    // The nearest cached ancestor carries deletion through any uncached gaps.
    const deleted = currentRow.node.deleted || currentRow.ancestorDeleted

    visibleRows.push({
      ...currentRow,
      deleted,
      missingAncestors:
        currentRow.node.parentId !== null && !cachedNodes.has(currentRow.node.parentId),
    })

    for (const childNode of (childrenByCachedParentId.get(currentRow.node.id) ?? []).toReversed()) {
      pendingRows.push({ node: childNode, depth: currentRow.depth + 1, ancestorDeleted: deleted })
    }
  }

  return visibleRows
}
