import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createTestApi } from './helpers/testApi.mjs'

test(
  'a fresh database is migrated and seeded once, preserving committed data across restart',
  { timeout: 45000 },
  async testContext => {
    const testApi = await createTestApi()
    testContext.after(() => testApi.dispose())

    let response = await fetch(`${testApi.url}/api/tree/children`)
    assert.equal(response.status, 200)
    const {
      items: [rootNode],
    } = await response.json()

    assert.equal(rootNode.value, 'World')
    assert.equal(testApi.sql('SELECT count(*) FROM tree_nodes'), '15')
    assert.equal(testApi.sql('SELECT count(*) FROM tree_initialization'), '1')
    assert.equal(testApi.sql('SELECT count(*) FROM "__EFMigrationsHistory"'), '1')
    assert.equal(
      testApi.sql(
        "SELECT condeferrable AND condeferred FROM pg_constraint WHERE conname = 'tree_nodes_parent_id_fkey'",
      ),
      't',
    )

    const childNodeId = randomUUID()
    response = await fetch(`${testApi.url}/api/tree/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creates: [{ id: childNodeId, parentId: rootNode.id, value: 'custom child' }],
        updates: [{ id: rootNode.id, version: rootNode.version, value: 'custom root' }],
        deletes: [],
      }),
    })
    assert.equal(response.status, 200, await response.text())

    const committedNodes = testApi.sql(
      'SELECT id, parent_id, value, version FROM tree_nodes ORDER BY id',
    )

    await testApi.restart()

    assert.equal(
      testApi.sql('SELECT id, parent_id, value, version FROM tree_nodes ORDER BY id'),
      committedNodes,
    )
    assert.equal(testApi.sql('SELECT count(*) FROM tree_initialization'), '1')
    assert.equal(testApi.sql('SELECT count(*) FROM "__EFMigrationsHistory"'), '1')

    response = await fetch(`${testApi.url}/api/tree/nodes/${childNodeId}`)

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      id: childNodeId,
      parentId: rootNode.id,
      value: 'custom child',
      version: 1,
      ancestorIds: [rootNode.id],
    })
  },
)
