import type { ApplyResult, Changes, LoadedNode, NodePage } from './types'

async function request<TResponse>(
  endpointPath: string,
  requestOptions?: RequestInit,
): Promise<TResponse> {
  const response = await fetch(`/api/tree/${endpointPath}`, requestOptions)

  if (!response.ok) {
    const problemDetails = await response.json().catch(() => null)
    throw new Error(
      problemDetails?.detail ??
        problemDetails?.title ??
        `Request failed (HTTP ${response.status}).`,
    )
  }

  return response.status === 204 ? (undefined as TResponse) : response.json()
}

export const api = {
  children(parentId: string | null, afterNodeId: string | null, abortSignal: AbortSignal) {
    const queryParameters = new URLSearchParams({ limit: '50' })

    if (parentId) {
      queryParameters.set('parentId', parentId)
    }

    if (afterNodeId) {
      queryParameters.set('after', afterNodeId)
    }

    return request<NodePage>(`children?${queryParameters}`, { signal: abortSignal })
  },

  load: (nodeId: string) => request<LoadedNode>(`nodes/${nodeId}`),

  apply: (requestedChanges: Changes) =>
    request<ApplyResult>('apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestedChanges),
    }),

  reset: () => request<void>('reset', { method: 'POST' }),
}
