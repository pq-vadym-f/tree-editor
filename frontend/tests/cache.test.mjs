import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildChanges, cacheReducer, cacheRows, isDeleted } from '../src/features/tree/cache.ts'

const loadNodeIntoCache = (cachedNodes, nodeId, ancestorIds = [], nodeValue = nodeId) =>
  cacheReducer(cachedNodes, {
    type: 'load',
    node: {
      id: nodeId,
      parentId: ancestorIds.at(-1) ?? null,
      value: nodeValue,
      version: 1,
      ancestorIds,
    },
  })
const applyCacheAction = (cachedNodes, actionType, nodeId, actionDetails = {}) =>
  cacheReducer(cachedNodes, { type: actionType, id: nodeId, ...actionDetails })

test('out-of-order loads reconnect under the nearest cached ancestor across gaps', () => {
  let cachedNodes = loadNodeIntoCache(new Map(), 'leaf', ['root', 'branch', 'parent'])
  assert.deepEqual(
    cacheRows(cachedNodes).map(cacheRow => [cacheRow.node.id, cacheRow.depth]),
    [['leaf', 0]],
  )
  cachedNodes = loadNodeIntoCache(cachedNodes, 'root')
  assert.deepEqual(
    cacheRows(cachedNodes).map(cacheRow => [cacheRow.node.id, cacheRow.depth]),
    [
      ['root', 0],
      ['leaf', 1],
    ],
  )
  cachedNodes = loadNodeIntoCache(cachedNodes, 'parent', ['root', 'branch'])
  cachedNodes = loadNodeIntoCache(cachedNodes, 'branch', ['root'])
  assert.deepEqual(
    cacheRows(cachedNodes).map(cacheRow => [cacheRow.node.id, cacheRow.depth]),
    [
      ['root', 0],
      ['branch', 1],
      ['parent', 2],
      ['leaf', 3],
    ],
  )
})

test('duplicate loading preserves drafts, and reverting the value removes the update', () => {
  let cachedNodes = loadNodeIntoCache(new Map(), 'root')
  cachedNodes = applyCacheAction(cachedNodes, 'edit', 'root', { value: 'draft' })
  cachedNodes = loadNodeIntoCache(cachedNodes, 'root', [], 'server value')
  assert.equal(cachedNodes.get('root').value, 'draft')
  assert.equal(buildChanges(cachedNodes).updates.length, 1)
  cachedNodes = applyCacheAction(cachedNodes, 'edit', 'root', { value: 'root' })
  assert.equal(buildChanges(cachedNodes).updates.length, 0)
})

test('deletion marks sparse descendants and descendants loaded later; edits and adds are blocked', () => {
  let cachedNodes = loadNodeIntoCache(loadNodeIntoCache(new Map(), 'root'), 'leaf', ['root', 'gap'])
  cachedNodes = applyCacheAction(cachedNodes, 'edit', 'leaf', { value: 'discarded edit' })
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'root')
  cachedNodes = loadNodeIntoCache(cachedNodes, 'late', ['root', 'gap'])
  assert.ok(isDeleted(cachedNodes, cachedNodes.get('leaf')))
  assert.ok(isDeleted(cachedNodes, cachedNodes.get('late')))
  assert.equal(applyCacheAction(cachedNodes, 'edit', 'late', { value: 'blocked' }), cachedNodes)
  assert.equal(
    applyCacheAction(cachedNodes, 'add', 'new', { parentId: 'late', value: 'blocked' }),
    cachedNodes,
  )
  assert.deepEqual(buildChanges(cachedNodes), {
    creates: [],
    updates: [],
    deletes: [{ id: 'root', version: 1 }],
  })
})

test('nested additions keep stable IDs and new-then-deleted subtrees never reach the database', () => {
  let cachedNodes = loadNodeIntoCache(new Map(), 'root')
  cachedNodes = applyCacheAction(cachedNodes, 'add', 'child', { parentId: 'root', value: 'child' })
  cachedNodes = applyCacheAction(cachedNodes, 'add', 'grandchild', {
    parentId: 'child',
    value: 'grandchild',
  })
  assert.equal(buildChanges(cachedNodes).creates[1].parentId, 'child')
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'child')
  assert.deepEqual(buildChanges(cachedNodes), { creates: [], updates: [], deletes: [] })
  cachedNodes = cacheReducer(cachedNodes, {
    type: 'applied',
    result: { versions: [], deletedCount: 0 },
  })
  assert.deepEqual([...cachedNodes.keys()], ['root'])
})

test('successful apply advances versions, clears drafts, and removes tombstones', () => {
  let cachedNodes = loadNodeIntoCache(loadNodeIntoCache(new Map(), 'root'), 'old', ['root'])
  cachedNodes = applyCacheAction(cachedNodes, 'edit', 'root', { value: 'edited' })
  cachedNodes = applyCacheAction(cachedNodes, 'add', 'new', { parentId: 'root', value: 'new' })
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'old')
  cachedNodes = cacheReducer(cachedNodes, {
    type: 'applied',
    result: {
      versions: [
        { id: 'root', version: 2 },
        { id: 'new', version: 1 },
      ],
      deletedCount: 1,
    },
  })
  assert.equal(cachedNodes.get('root').version, 2)
  assert.equal(cachedNodes.get('new').version, 1)
  assert.equal(cachedNodes.has('old'), false)
  assert.deepEqual(buildChanges(cachedNodes), { creates: [], updates: [], deletes: [] })
})

test('overlapping deletions send only the highest root regardless of deletion order', () => {
  let cachedNodes = loadNodeIntoCache(loadNodeIntoCache(new Map(), 'root'), 'leaf', ['root', 'gap'])
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'leaf')
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'root')
  assert.deepEqual(buildChanges(cachedNodes).deletes, [{ id: 'root', version: 1 }])
})

test('deep sparse ancestry uses iterative rendering and does not create placeholder cache entries', () => {
  const ancestorIds = Array.from({ length: 20000 }, (_, nodeIndex) => `node-${nodeIndex}`)
  let cachedNodes = loadNodeIntoCache(new Map(), 'leaf', ancestorIds)
  cachedNodes = loadNodeIntoCache(cachedNodes, ancestorIds[0])
  const visibleRows = cacheRows(cachedNodes)
  assert.equal(visibleRows.length, 2)
  assert.equal(visibleRows[1].depth, 1)
  assert.equal(visibleRows[1].missingAncestors, true)
})

test('undoing one of 1001 sibling deletions makes the remaining batch applicable', () => {
  let cachedNodes = new Map()
  for (let nodeIndex = 0; nodeIndex < 1001; nodeIndex++) {
    cachedNodes = applyCacheAction(
      loadNodeIntoCache(cachedNodes, `child-${nodeIndex}`, ['root']),
      'delete',
      `child-${nodeIndex}`,
    )
  }
  assert.equal(buildChanges(cachedNodes).deletes.length, 1001)

  cachedNodes = applyCacheAction(cachedNodes, 'restore', 'child-1000')
  const pendingChanges = buildChanges(cachedNodes)
  assert.equal(pendingChanges.deletes.length, 1000)
  assert.equal(pendingChanges.creates.length + pendingChanges.updates.length, 0)
  assert.equal(isDeleted(cachedNodes, cachedNodes.get('child-1000')), false)

  cachedNodes = cacheReducer(cachedNodes, {
    type: 'applied',
    result: { versions: [], deletedCount: 1000 },
  })
  assert.deepEqual([...cachedNodes.keys()], ['child-1000'])
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'child-1000')
  assert.deepEqual(buildChanges(cachedNodes).deletes, [{ id: 'child-1000', version: 1 }])
})

test('undoing an ancestor deletion preserves sparse edits, additions, and independent deletions', () => {
  let cachedNodes = loadNodeIntoCache(
    loadNodeIntoCache(loadNodeIntoCache(new Map(), 'root'), 'leaf', ['root', 'gap']),
    'other',
    ['root'],
  )
  cachedNodes = applyCacheAction(cachedNodes, 'edit', 'leaf', { value: 'draft' })
  cachedNodes = applyCacheAction(cachedNodes, 'add', 'new', {
    parentId: 'leaf',
    value: 'new child',
  })
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'other')
  const changesBeforeDeletion = buildChanges(cachedNodes)

  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'root')
  cachedNodes = applyCacheAction(cachedNodes, 'restore', 'root')
  assert.deepEqual(buildChanges(cachedNodes), changesBeforeDeletion)
  assert.equal(cachedNodes.get('leaf').value, 'draft')
  assert.equal(isDeleted(cachedNodes, cachedNodes.get('new')), false)
  assert.equal(isDeleted(cachedNodes, cachedNodes.get('other')), true)
})

test('undoing a descendant deletion does not bypass a deleted ancestor', () => {
  let cachedNodes = loadNodeIntoCache(loadNodeIntoCache(new Map(), 'root'), 'leaf', ['root', 'gap'])
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'leaf')
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'root')
  cachedNodes = applyCacheAction(cachedNodes, 'restore', 'leaf')
  assert.equal(cachedNodes.get('leaf').deleted, false)
  assert.equal(isDeleted(cachedNodes, cachedNodes.get('leaf')), true)
  assert.equal(applyCacheAction(cachedNodes, 'edit', 'leaf', { value: 'blocked' }), cachedNodes)

  cachedNodes = applyCacheAction(cachedNodes, 'restore', 'root')
  assert.deepEqual(buildChanges(cachedNodes), { creates: [], updates: [], deletes: [] })
})

test('undoing a new subtree deletion restores its pending creates', () => {
  let cachedNodes = loadNodeIntoCache(new Map(), 'root')
  cachedNodes = applyCacheAction(cachedNodes, 'add', 'child', { parentId: 'root', value: 'child' })
  cachedNodes = applyCacheAction(cachedNodes, 'add', 'grandchild', {
    parentId: 'child',
    value: 'grandchild',
  })
  const changesBeforeDeletion = buildChanges(cachedNodes)
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'child')
  cachedNodes = applyCacheAction(cachedNodes, 'restore', 'child')
  assert.deepEqual(buildChanges(cachedNodes), changesBeforeDeletion)
})

test('row deletion status follows sparse ancestors loaded later and resets between branches', () => {
  let cachedNodes = loadNodeIntoCache(new Map(), 'leaf', ['root', 'gap', 'branch'])
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'leaf')
  cachedNodes = loadNodeIntoCache(cachedNodes, 'branch', ['root', 'gap'])
  cachedNodes = loadNodeIntoCache(cachedNodes, 'root')
  cachedNodes = loadNodeIntoCache(cachedNodes, 'other')
  cachedNodes = applyCacheAction(cachedNodes, 'edit', 'other', { value: 'edited' })
  cachedNodes = applyCacheAction(cachedNodes, 'delete', 'root')

  const rows = cacheRows(cachedNodes)
  assert.deepEqual(
    rows.map(({ node, deleted, ancestorDeleted }) => [node.id, deleted, ancestorDeleted]),
    [
      ['root', true, false],
      ['branch', true, true],
      ['leaf', true, true],
      ['other', false, false],
    ],
  )
  assert.deepEqual(buildChanges(cachedNodes, rows), {
    creates: [],
    updates: [{ id: 'other', version: 1, value: 'edited' }],
    deletes: [{ id: 'root', version: 1 }],
  })

  cachedNodes = applyCacheAction(cachedNodes, 'restore', 'root')
  assert.deepEqual(
    cacheRows(cachedNodes).map(({ node, deleted }) => [node.id, deleted]),
    [
      ['root', false],
      ['branch', false],
      ['leaf', true],
      ['other', false],
    ],
  )
  assert.deepEqual(buildChanges(cachedNodes).deletes, [{ id: 'leaf', version: 1 }])
})

test('building rows and changes for a fully cached chain uses a linear number of cache lookups', () => {
  let lookups = 0
  class CountingCache extends Map {
    get(id) {
      lookups++
      return super.get(id)
    }
    has(id) {
      lookups++
      return super.has(id)
    }
  }
  const cachedNodes = new CountingCache()
  const ancestorIds = []
  for (let index = 0; index < 1000; index++) {
    const id = `node-${index}`
    cachedNodes.set(id, {
      id,
      parentId: ancestorIds.at(-1) ?? null,
      ancestorIds: [...ancestorIds],
      value: index === 999 ? 'edited' : id,
      originalValue: id,
      version: 1,
      deleted: false,
    })
    ancestorIds.push(id)
  }
  const rows = cacheRows(cachedNodes)
  assert.equal(rows.length, 1000)
  assert.ok(rows.every(row => !row.deleted))
  assert.deepEqual(buildChanges(cachedNodes, rows), {
    creates: [],
    updates: [{ id: 'node-999', version: 1, value: 'edited' }],
    deletes: [],
  })
  assert.ok(lookups <= cachedNodes.size * 5, `Expected linear cache lookups, received ${lookups}`)
})
