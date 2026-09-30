import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestApi } from './helpers/testApi.mjs'

let testApi

const executeSql = sqlStatement => testApi.sql(sqlStatement)

before(
  async () => {
    testApi = await createTestApi()
  },
  { timeout: 45000 },
)

after(async () => {
  await testApi?.dispose()
})

async function sendTreeRequest(endpointPath, requestBody, expectedStatusCode = 200) {
  const response = await fetch(
    `${testApi.url}/api/tree/${endpointPath}`,
    requestBody === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
  )
  const responseText = await response.text()

  assert.equal(response.status, expectedStatusCode, responseText)

  return responseText ? JSON.parse(responseText) : undefined
}

const applyChanges = (requestedChanges, expectedStatusCode = 200) =>
  sendTreeRequest(
    'apply',
    { creates: [], updates: [], deletes: [], ...requestedChanges },
    expectedStatusCode,
  )

const resetSampleData = () => sendTreeRequest('reset', {}, 204)
const loadNode = nodeId => sendTreeRequest(`nodes/${nodeId}`)
const loadRootNode = async () => (await sendTreeRequest('children')).items[0]

test('sample has five levels; loading returns only one node plus ancestor IDs', async () => {
  const rootNode = await loadRootNode()

  assert.equal(rootNode.value, 'World')

  const podilId = executeSql("SELECT id FROM tree_nodes WHERE value = 'Podil'")
  const podilNode = await loadNode(podilId)

  assert.equal(podilNode.ancestorIds.length, 4)
  assert.equal(podilNode.ancestorIds[0], rootNode.id)
  assert.equal(podilNode.parentId, podilNode.ancestorIds.at(-1))
  assert.equal(Object.hasOwn(podilNode, 'children'), false)
})

test('keyset pagination bounds wide branches without duplicates', async () => {
  const parentNode = await loadRootNode()

  await applyChanges({
    creates: Array.from({ length: 121 }, (_, nodeIndex) => ({
      id: randomUUID(),
      parentId: parentNode.id,
      value: `wide-${nodeIndex}`,
    })),
  })

  const loadedNodeIds = []
  let nextPageCursor = null

  do {
    const childNodePage = await sendTreeRequest(
      `children?parentId=${parentNode.id}&limit=17${nextPageCursor ? `&after=${nextPageCursor}` : ''}`,
    )
    assert.ok(childNodePage.items.length <= 17)
    loadedNodeIds.push(...childNodePage.items.map(treeNode => treeNode.id))
    nextPageCursor = childNodePage.nextCursor
  } while (nextPageCursor)

  assert.equal(loadedNodeIds.length, 124)
  assert.equal(new Set(loadedNodeIds).size, loadedNodeIds.length)

  await sendTreeRequest('children?limit=101', undefined, 400)
  await sendTreeRequest('children?limit=0', undefined, 400)
})

test('atomic apply supports edits and nested new children in reverse order', async () => {
  const parentNode = await loadRootNode()
  const childId = randomUUID()
  const grandchildId = randomUUID()

  const applyResult = await applyChanges({
    updates: [{ id: parentNode.id, version: parentNode.version, value: "World's edited value" }],
    creates: [
      { id: grandchildId, parentId: childId, value: 'grandchild' },
      { id: childId, parentId: parentNode.id, value: 'child' },
    ],
  })

  assert.equal(applyResult.versions.length, 3)
  assert.deepEqual((await loadNode(grandchildId)).ancestorIds, [parentNode.id, childId])
  assert.equal((await loadNode(parentNode.id)).version, parentNode.version + 1)
})

test('a failed insert rolls back earlier deletions and updates', async () => {
  const parentNode = await loadRootNode()
  const deletedNodeId = executeSql("SELECT id FROM tree_nodes WHERE value = 'Europe'")
  const nodeToDelete = await loadNode(deletedNodeId)

  await applyChanges(
    {
      deletes: [{ id: nodeToDelete.id, version: nodeToDelete.version }],
      updates: [{ id: parentNode.id, version: parentNode.version, value: 'must roll back' }],
      creates: [{ id: randomUUID(), parentId: randomUUID(), value: 'missing parent' }],
    },
    409,
  )

  assert.equal((await loadNode(parentNode.id)).value, parentNode.value)
  assert.equal((await loadNode(parentNode.id)).version, parentNode.version)
  assert.equal((await loadNode(nodeToDelete.id)).value, nodeToDelete.value)
  assert.equal(executeSql("SELECT count(*) FROM tree_nodes WHERE value = 'Podil'"), '1')
})

test('stale and concurrent edits cannot overwrite a committed value', async () => {
  const treeNode = await loadRootNode()

  const responseStatusCodes = await Promise.all(
    ['first', 'second'].map(value =>
      fetch(`${testApi.url}/api/tree/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creates: [],
          deletes: [],
          updates: [{ id: treeNode.id, version: treeNode.version, value }],
        }),
      }).then(response => response.status),
    ),
  )

  assert.deepEqual(responseStatusCodes.sort(), [200, 409])

  await applyChanges({ deletes: [{ id: treeNode.id, version: treeNode.version }] }, 409)

  assert.equal((await loadNode(treeNode.id)).version, treeNode.version + 1)
})

test('invalid batches reject cycles, duplicate IDs, blank values, reparenting, and deleted parents', async () => {
  const treeNode = await loadRootNode()
  const firstNodeId = randomUUID()
  const secondNodeId = randomUUID()

  await applyChanges(
    {
      creates: [
        { id: firstNodeId, parentId: secondNodeId, value: 'a' },
        { id: secondNodeId, parentId: firstNodeId, value: 'b' },
      ],
    },
    400,
  )

  await applyChanges({ creates: [{ id: firstNodeId, parentId: firstNodeId, value: 'self' }] }, 400)

  await applyChanges(
    { updates: [{ id: treeNode.id, version: treeNode.version, value: '  ' }] },
    400,
  )

  await applyChanges(
    { updates: [{ id: treeNode.id, version: treeNode.version, value: 'x'.repeat(501) }] },
    400,
  )

  await applyChanges(
    {
      creates: [
        { id: firstNodeId, parentId: treeNode.id, value: 'a' },
        { id: firstNodeId, parentId: treeNode.id, value: 'b' },
      ],
    },
    400,
  )

  await applyChanges(
    {
      updates: [{ id: treeNode.id, version: treeNode.version, value: 'x', parentId: firstNodeId }],
    },
    400,
  )

  await applyChanges({ updates: [null] }, 400)
  await sendTreeRequest('apply', { creates: null, updates: [], deletes: [] }, 400)

  await applyChanges(
    {
      creates: Array.from({ length: 1001 }, () => ({
        id: randomUUID(),
        parentId: treeNode.id,
        value: 'x',
      })),
    },
    400,
  )

  const europeNodeId = executeSql("SELECT id FROM tree_nodes WHERE value = 'Europe'")
  const podilNodeId = executeSql("SELECT id FROM tree_nodes WHERE value = 'Podil'")

  await applyChanges(
    {
      deletes: [{ id: europeNodeId, version: 1 }],
      creates: [{ id: firstNodeId, parentId: podilNodeId, value: 'invalid child' }],
    },
    400,
  )

  await applyChanges(
    {
      deletes: [{ id: europeNodeId, version: 1 }],
      updates: [{ id: podilNodeId, version: 1, value: 'invalid edit' }],
    },
    400,
  )

  assert.throws(() =>
    executeSql(`UPDATE tree_nodes SET parent_id = '${treeNode.id}' WHERE id = '${podilNodeId}'`),
  )
})

test('a create cannot reuse a deleted descendant ID or reset its version', async () => {
  const parentNode = await loadRootNode()
  const europeNode = await loadNode(executeSql("SELECT id FROM tree_nodes WHERE value = 'Europe'"))
  const kyivNode = await loadNode(executeSql("SELECT id FROM tree_nodes WHERE value = 'Kyiv'"))
  const asiaNodeId = executeSql("SELECT id FROM tree_nodes WHERE value = 'Asia'")
  const originalNodeCount = executeSql('SELECT count(*) FROM tree_nodes')

  await applyChanges(
    {
      deletes: [{ id: europeNode.id, version: europeNode.version }],
      creates: [{ id: kyivNode.id, parentId: asiaNodeId, value: 'replacement Kyiv' }],
      updates: [{ id: parentNode.id, version: parentNode.version, value: 'must not persist' }],
    },
    409,
  )

  assert.deepEqual(await loadNode(kyivNode.id), kyivNode)
  assert.deepEqual(await loadNode(europeNode.id), europeNode)
  assert.equal((await loadNode(parentNode.id)).value, parentNode.value)
  assert.equal((await loadNode(parentNode.id)).version, parentNode.version)
  assert.equal(executeSql('SELECT count(*) FROM tree_nodes'), originalNodeCount)
})

test('NUL-containing values return a validation error without changing the batch', async () => {
  const parentNode = await loadRootNode()
  const europeNode = await loadNode(executeSql("SELECT id FROM tree_nodes WHERE value = 'Europe'"))
  const newNodeId = randomUUID()

  for (const requestedChanges of [
    { updates: [{ id: parentNode.id, version: parentNode.version, value: 'before\u0000after' }] },
    { creates: [{ id: newNodeId, parentId: parentNode.id, value: 'before\u0000after' }] },
  ]) {
    const problemDetails = await applyChanges(
      {
        ...requestedChanges,
        deletes: [{ id: europeNode.id, version: europeNode.version }],
      },
      400,
    )

    assert.match(problemDetails.detail, /NUL/)
    assert.deepEqual(await loadNode(europeNode.id), europeNode)
    assert.equal((await loadNode(parentNode.id)).value, parentNode.value)
    assert.equal((await loadNode(parentNode.id)).version, parentNode.version)
  }

  await sendTreeRequest(`nodes/${newNodeId}`, undefined, 404)
})

test(
  'deep trees load and delete without application or cascading-FK recursion',
  { timeout: 30000 },
  async () => {
    const parentNode = await loadRootNode()
    let parentId = parentNode.id
    let subtreeRootId

    for (let batchIndex = 0; batchIndex < 3; batchIndex++) {
      const creates = []

      for (let nodeIndex = 0; nodeIndex < 800; nodeIndex++) {
        const nodeId = randomUUID()
        subtreeRootId ??= nodeId
        creates.push({ id: nodeId, parentId, value: `deep-${batchIndex}-${nodeIndex}` })
        parentId = nodeId
      }

      await applyChanges({ creates })
    }

    assert.equal((await loadNode(parentId)).ancestorIds.length, 2400)

    const applyResult = await applyChanges({ deletes: [{ id: subtreeRootId, version: 1 }] })

    assert.equal(applyResult.deletedCount, 2400)
    await sendTreeRequest(`nodes/${parentId}`, undefined, 404)
  },
)

test('deleting a subtree includes descendants never loaded by the caller', async () => {
  const europeNodeId = executeSql("SELECT id FROM tree_nodes WHERE value = 'Europe'")

  const applyResult = await applyChanges({ deletes: [{ id: europeNodeId, version: 1 }] })

  assert.equal(applyResult.deletedCount, 7)
  assert.equal(
    executeSql("SELECT count(*) FROM tree_nodes WHERE value IN ('Podil', 'Kyiv', 'Berlin')"),
    '0',
  )
})

test('concurrent insertion and subtree deletion never leave an orphan', async () => {
  const parentNode = await loadRootNode()
  const branchNodeId = randomUUID()
  const childNodeId = randomUUID()

  await applyChanges({ creates: [{ id: branchNodeId, parentId: parentNode.id, value: 'race' }] })

  const concurrentChangeRequests = [
    {
      creates: [{ id: childNodeId, parentId: branchNodeId, value: 'racing child' }],
      updates: [],
      deletes: [],
    },
    { creates: [], updates: [], deletes: [{ id: branchNodeId, version: 1 }] },
  ]

  const responses = await Promise.all(
    concurrentChangeRequests.map(requestBody =>
      fetch(`${testApi.url}/api/tree/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }),
    ),
  )

  assert.ok(responses.every(response => [200, 409].includes(response.status)))
  assert.ok(responses.some(response => response.status === 200))
  assert.equal(
    executeSql(`
      SELECT count(*)
      FROM tree_nodes c
      LEFT JOIN tree_nodes p ON c.parent_id = p.id
      WHERE c.parent_id IS NOT NULL AND p.id IS NULL
    `),
    '0',
  )
})

test('reset restores the sample and invalidates caches from before reset', async () => {
  const rootBeforeReset = await loadRootNode()

  await resetSampleData()

  const rootAfterReset = await loadRootNode()

  assert.notEqual(rootBeforeReset.id, rootAfterReset.id)
  assert.equal(rootAfterReset.value, 'World')
  assert.equal(executeSql('SELECT count(*) FROM tree_nodes'), '15')

  await applyChanges(
    { updates: [{ id: rootBeforeReset.id, version: rootBeforeReset.version, value: 'stale' }] },
    409,
  )

  await applyChanges({ deletes: [{ id: rootAfterReset.id, version: rootAfterReset.version }] })

  assert.deepEqual((await sendTreeRequest('children')).items, [])
  assert.equal(executeSql('SELECT count(*) FROM tree_initialization'), '1')

  await testApi.restart()

  assert.deepEqual((await sendTreeRequest('children')).items, [])

  await resetSampleData()

  assert.equal((await loadRootNode()).value, 'World')
})
