export type TreeNode = {
  id: string
  parentId: string | null
  value: string
  version: number
  hasChildren: boolean
}

export type LoadedNode = Omit<TreeNode, 'hasChildren'> & {
  ancestorIds: string[]
}

export type NodePage = {
  items: TreeNode[]
  nextCursor: string | null
}

export type Changes = {
  creates: { id: string; parentId: string; value: string }[]
  updates: { id: string; version: number; value: string }[]
  deletes: { id: string; version: number }[]
}

export type ApplyResult = {
  versions: { id: string; version: number }[]
  deletedCount: number
}
