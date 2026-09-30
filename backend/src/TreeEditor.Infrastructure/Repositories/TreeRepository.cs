using Microsoft.EntityFrameworkCore;
using TreeEditor.Core.Abstractions;
using TreeEditor.Core.Contracts;
using TreeEditor.Core.Domain;

namespace TreeEditor.Infrastructure.Repositories;

public sealed class TreeRepository(TreeDbContext databaseContext) : ITreeRepository
{
    public async Task<NodeListResponse> GetChildrenAsync(
        Guid? parentId,
        Guid? afterNodeId,
        int pageSize,
        CancellationToken cancellationToken)
    {
        var childNodesQuery = databaseContext.Nodes
            .AsNoTracking()
            .Where(node => node.ParentId == parentId);

        if (afterNodeId is Guid paginationCursorNodeId)
        {
            childNodesQuery = childNodesQuery.Where(node => EF.Functions.GreaterThan(
                ValueTuple.Create(node.Id),
                ValueTuple.Create(paginationCursorNodeId)));
        }

        var childNodeSummaries = await childNodesQuery
            .OrderBy(node => node.Id)
            .Take(pageSize + 1)
            .Select(node => new NodeResponse(
                node.Id,
                node.ParentId,
                node.Value,
                node.Version,
                databaseContext.Nodes.Any(childNode => childNode.ParentId == node.Id)))
            .ToListAsync(cancellationToken);

        var hasMoreChildren = childNodeSummaries.Count > pageSize;

        if (hasMoreChildren)
        {
            childNodeSummaries.RemoveAt(childNodeSummaries.Count - 1);
        }

        return new(childNodeSummaries, hasMoreChildren ? childNodeSummaries[^1].Id : null);
    }

    public Task<CachedNodeResponse?> LoadAsync(Guid nodeId, CancellationToken cancellationToken) =>
        databaseContext.Database
            .SqlQuery<CachedNodeResponse>($"""
                WITH RECURSIVE ancestors AS (
                    SELECT parent_node.id, parent_node.parent_id, 1 AS depth
                    FROM tree_nodes requested_node
                    JOIN tree_nodes parent_node ON parent_node.id = requested_node.parent_id
                    WHERE requested_node.id = {nodeId}

                    UNION ALL

                    SELECT parent_node.id, parent_node.parent_id, ancestor.depth + 1
                    FROM ancestors ancestor
                    JOIN tree_nodes parent_node ON parent_node.id = ancestor.parent_id
                )
                SELECT
                    requested_node.id AS "Id",
                    requested_node.parent_id AS "ParentId",
                    requested_node.value AS "Value",
                    requested_node.version AS "Version",
                    ARRAY(SELECT id FROM ancestors ORDER BY depth DESC) AS "AncestorIds"
                FROM tree_nodes requested_node
                WHERE requested_node.id = {nodeId}
                """)
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<TreeNode>> GetForUpdateAsync(
        Guid[] nodeIds,
        CancellationToken cancellationToken)
    {
        if (nodeIds.Length == 0)
        {
            return [];
        }

        return await databaseContext.Nodes
            .FromSql($"""
                SELECT id, parent_id, value, version
                FROM tree_nodes
                WHERE id = ANY({nodeIds})
                ORDER BY id
                FOR UPDATE
                """)
            .ToListAsync(cancellationToken);
    }

    public Task<bool> ContainsInSubtreesAsync(
        Guid[] subtreeRootIds,
        Guid[] candidateNodeIds,
        CancellationToken cancellationToken) =>
        databaseContext.Database
            .SqlQuery<bool>($"""
                WITH RECURSIVE nodes_to_delete(id) AS (
                    SELECT id
                    FROM tree_nodes
                    WHERE id = ANY({subtreeRootIds})

                    UNION

                    SELECT child_node.id
                    FROM tree_nodes child_node
                    JOIN nodes_to_delete deleted_parent ON child_node.parent_id = deleted_parent.id
                )
                SELECT EXISTS(
                    SELECT 1
                    FROM nodes_to_delete
                    WHERE id = ANY({candidateNodeIds})
                ) AS "Value"
                """)
            .SingleAsync(cancellationToken);

    public Task<int> DeleteSubtreesAsync(Guid[] subtreeRootIds, CancellationToken cancellationToken) =>
        databaseContext.Database.ExecuteSqlAsync($"""
            WITH RECURSIVE nodes_to_delete(id) AS (
                SELECT id
                FROM tree_nodes
                WHERE id = ANY({subtreeRootIds})

                UNION

                SELECT child_node.id
                FROM tree_nodes child_node
                JOIN nodes_to_delete deleted_parent ON child_node.parent_id = deleted_parent.id
            )
            DELETE FROM tree_nodes
            WHERE id IN (SELECT id FROM nodes_to_delete)
            """, cancellationToken);

    public void AddRange(IEnumerable<TreeNode> newNodes) => databaseContext.Nodes.AddRange(newNodes);

    public async Task ResetAsync(CancellationToken cancellationToken)
    {
        await databaseContext.Database.ExecuteSqlRawAsync(
            "LOCK TABLE tree_nodes IN ACCESS EXCLUSIVE MODE",
            cancellationToken);

        await databaseContext.Nodes.ExecuteDeleteAsync(cancellationToken);
        databaseContext.Nodes.AddRange(SampleTree.Create());
    }
}
