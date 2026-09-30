using TreeEditor.Core.Contracts;
using TreeEditor.Core.Domain;

namespace TreeEditor.Core.Abstractions;

public interface ITreeRepository
{
    Task<NodeListResponse> GetChildrenAsync(
        Guid? parentId,
        Guid? afterNodeId,
        int pageSize,
        CancellationToken cancellationToken);

    Task<CachedNodeResponse?> LoadAsync(Guid nodeId, CancellationToken cancellationToken);

    Task<IReadOnlyList<TreeNode>> GetForUpdateAsync(Guid[] nodeIds, CancellationToken cancellationToken);

    Task<bool> ContainsInSubtreesAsync(
        Guid[] subtreeRootIds,
        Guid[] candidateNodeIds,
        CancellationToken cancellationToken);

    Task<int> DeleteSubtreesAsync(Guid[] subtreeRootIds, CancellationToken cancellationToken);

    void AddRange(IEnumerable<TreeNode> newNodes);

    Task ResetAsync(CancellationToken cancellationToken);
}
