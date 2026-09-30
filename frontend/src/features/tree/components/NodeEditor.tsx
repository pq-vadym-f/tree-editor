import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CacheNode } from '../cache'
import { getValueError } from '../validation'

type NodeEditorProps = {
  node: CacheNode
  deleted: boolean
  disabled: boolean
  onEdit: (nodeValue: string) => void
  onAdd: (nodeValue: string) => void
  onDelete: () => void
  onRestore: () => void
}

export function NodeEditor({
  node,
  deleted,
  disabled,
  onEdit,
  onAdd,
  onDelete,
  onRestore,
}: NodeEditorProps) {
  const [childValue, setChildValue] = useState('')
  const nodeValueError = getValueError(node.value)
  const childValueError = getValueError(childValue)
  const isEditingDisabled = disabled || deleted

  function handleAddChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (childValueError || isEditingDisabled) {
      return
    }

    onAdd(childValue)
    setChildValue('')
  }

  return (
    <section
      className="panel editor"
      aria-labelledby="editor-title"
    >
      <h2 id="editor-title">Selected cached node</h2>
      <p className="hint node-id">
        ID: {node.id} · Database depth: {node.ancestorIds.length + 1}
      </p>
      {deleted && (
        <p role="status">
          {node.deleted
            ? 'Marked for deletion, including all descendants. Undo deletion to restore this draft.'
            : 'An ancestor is marked for deletion. Select that ancestor to undo its deletion.'}
        </p>
      )}

      <label htmlFor="node-value">Value</label>
      <input
        id="node-value"
        value={node.value}
        maxLength={500}
        disabled={isEditingDisabled}
        onChange={event => onEdit(event.target.value)}
      />
      {!deleted && nodeValueError && <p className="error">{nodeValueError}</p>}
      <p className="hint">Edits stay in this browser tab until you click Apply all changes.</p>

      <form onSubmit={handleAddChild}>
        <label htmlFor="child-value">New child value</label>
        <div className="inline-form">
          <input
            id="child-value"
            value={childValue}
            maxLength={500}
            disabled={isEditingDisabled}
            onChange={event => setChildValue(event.target.value)}
          />
          <button disabled={isEditingDisabled || childValueError !== null}>Add child</button>
        </div>
        {!deleted && childValue && childValueError && <p className="error">{childValueError}</p>}
      </form>

      {node.deleted ? (
        <button
          disabled={disabled}
          onClick={onRestore}
        >
          Undo deletion
        </button>
      ) : (
        <button
          className="danger"
          disabled={isEditingDisabled}
          onClick={onDelete}
        >
          Mark subtree for deletion
        </button>
      )}
    </section>
  )
}
