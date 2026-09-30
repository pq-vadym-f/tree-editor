import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createTestApi } from './helpers/testApi.mjs'

let testApi

before(
  async () => {
    testApi = await createTestApi({ environment: 'Development' })
  },
  { timeout: 45000 },
)

after(async () => {
  await testApi?.dispose()
})

test('OpenAPI describes every endpoint, DTO, and supported response status', async () => {
  const response = await fetch(`${testApi.url}/openapi/v1.json`)
  assert.equal(response.status, 200)
  const document = await response.json()

  const expectedOperations = [
    ['/api/health', 'get', [200, 503, 500]],
    ['/api/tree/children', 'get', [200, 400, 500]],
    ['/api/tree/nodes/{id}', 'get', [200, 404, 500]],
    ['/api/tree/apply', 'post', [200, 400, 409, 413, 415, 500]],
    ['/api/tree/reset', 'post', [204, 409, 500]],
  ]

  assert.equal(Object.keys(document.paths).length, expectedOperations.length)

  for (const [path, method, statusCodes] of expectedOperations) {
    const operation = document.paths[path][method]
    assert.ok(operation.summary, `${method} ${path} needs a summary`)
    assert.ok(operation.description, `${method} ${path} needs a description`)
    assert.ok(operation.operationId, `${method} ${path} needs an operation ID`)

    for (const statusCode of statusCodes) {
      assert.ok(operation.responses[statusCode], `${method} ${path} must describe ${statusCode}`)
    }
  }

  const schemas = document.components.schemas

  for (const name of [
    'CreateNodeRequest',
    'UpdateNodeRequest',
    'DeleteNodeRequest',
    'ApplyChangesRequest',
    'NodeResponse',
    'CachedNodeResponse',
    'NodeListResponse',
    'NodeVersionResponse',
    'ApplyChangesResponse',
    'HealthResponse',
  ]) {
    assert.ok(schemas[name]?.description, `${name} needs a schema description`)
  }

  assert.equal(schemas.TreeNode, undefined)
  assert.equal(schemas.CreateNodeRequest.properties.value.maxLength, 500)
  assert.equal(schemas.UpdateNodeRequest.properties.version.minimum, 1)
  assert.deepEqual(schemas.CreateNodeRequest.required.toSorted(), ['id', 'parentId', 'value'])
  assert.deepEqual(schemas.UpdateNodeRequest.required.toSorted(), ['id', 'value', 'version'])
  assert.deepEqual(schemas.DeleteNodeRequest.required.toSorted(), ['id', 'version'])
  assert.deepEqual(schemas.ApplyChangesRequest.required.toSorted(), [
    'creates',
    'deletes',
    'updates',
  ])
})

test('health keeps its existing JSON response', async () => {
  const response = await fetch(`${testApi.url}/api/health`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { api: 'ok', database: 'ok' })
})

test('routing, validation, and request-body errors return Problem Details', async () => {
  const requests = [
    ['/api/not-found', undefined, 404],
    ['/api/tree/nodes/not-a-guid', undefined, 404],
    ['/api/tree/nodes/ffffffff-ffff-ffff-ffff-ffffffffffff', undefined, 404],
    ['/api/tree/apply', undefined, 405],
    ['/api/tree/children?limit=0', undefined, 400],
    ['/api/tree/children?limit=invalid', undefined, 400],
    [
      '/api/tree/apply',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      },
      400,
    ],
    [
      '/api/tree/apply',
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'unsupported',
      },
      415,
    ],
    [
      '/api/tree/apply',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: ' '.repeat(2_000_001),
      },
      413,
    ],
  ]

  for (const [path, options, statusCode] of requests) {
    const response = await fetch(`${testApi.url}${path}`, options)
    assert.equal(response.status, statusCode, path)
    assert.match(response.headers.get('content-type'), /^application\/problem\+json/)
    const problem = await response.json()
    assert.equal(problem.status, statusCode)
    assert.ok(problem.title)
    assert.equal(problem.instance, path.split('?')[0])
  }
})

test('missing required request fields and unknown fields are rejected', async () => {
  for (const body of [
    {},
    { creates: [], updates: [], deletes: [], unexpected: true },
    { creates: [{ parentId: randomUUID(), value: 'Missing ID' }], updates: [], deletes: [] },
    { creates: [], updates: [{ id: randomUUID(), value: 'Missing version' }], deletes: [] },
  ]) {
    const response = await fetch(`${testApi.url}/api/tree/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    assert.equal(response.status, 400)
    assert.match(response.headers.get('content-type'), /^application\/problem\+json/)
    assert.equal((await response.json()).status, 400)
  }
})

test('existing case-insensitive names and numeric strings remain accepted', async () => {
  const rootResponse = await fetch(`${testApi.url}/api/tree/children`)
  const {
    items: [root],
  } = await rootResponse.json()

  const response = await fetch(`${testApi.url}/api/tree/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      CREATES: [],
      UPDATES: [{ ID: root.id, VERSION: String(root.version), VALUE: 'Compatible update' }],
      DELETES: [],
    }),
  })

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    versions: [{ id: root.id, version: root.version + 1 }],
    deletedCount: 0,
  })
})

test('the HTTP request examples execute with current node IDs and versions', async () => {
  const rootResponse = await fetch(`${testApi.url}/api/tree/children`)
  const {
    items: [root],
  } = await rootResponse.json()
  let requestFile = await readFile(
    new URL('../src/TreeEditor.Api/TreeEditor.Api.http', import.meta.url),
    'utf8',
  )

  for (const [name, value] of Object.entries({
    baseUrl: testApi.url,
    nodeId: root.id,
    nodeVersion: String(root.version),
    newNodeId: randomUUID(),
  })) {
    requestFile = requestFile.replaceAll(`{{${name}}}`, value)
  }

  const requests = requestFile.split(/^###\s*$/m).slice(1)
  const expectedStatuses = [200, 200, 200, 200, 200, 200, 404, 400, 204]
  assert.equal(requests.length, expectedStatuses.length)

  for (const [index, request] of requests.entries()) {
    const [head, body] = request.trim().split(/\r?\n\r?\n/)
    const [requestLine, ...headerLines] = head.split(/\r?\n/)
    const [method, url] = requestLine.split(' ')
    const headers = Object.fromEntries(headerLines.map(line => line.split(': ')))
    const response = await fetch(url, { method, headers, body })

    assert.equal(response.status, expectedStatuses[index], `${method} ${url}`)
    await response.arrayBuffer()
  }
})

test('OpenAPI is not exposed in Production', { timeout: 45000 }, async testContext => {
  const productionApi = await createTestApi()
  testContext.after(() => productionApi.dispose())

  const response = await fetch(`${productionApi.url}/openapi/v1.json`)

  assert.equal(response.status, 404)
  assert.match(response.headers.get('content-type'), /^application\/problem\+json/)
})
