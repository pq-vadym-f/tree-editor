using TreeEditor.Core.Abstractions;
using TreeEditor.Core.Contracts;
using TreeEditor.Core.Domain;
using TreeEditor.Core.Errors;
using TreeEditor.Core.Services.Interfaces;

namespace TreeEditor.Core.Services;

public sealed class TreeService(ITreeRepository treeRepository, IUnitOfWork unitOfWork) : ITreeService
{
    public Task<NodeListResponse> GetChildrenAsync(
        Guid? parentId,
        Guid? afterNodeId,
        int pageSize,
        CancellationToken cancellationToken)
    {
        if (pageSize is < 1 or > 100)
        {
            throw new TreeValidationException("Page size must be between 1 and 100.");
        }

        return treeRepository.GetChildrenAsync(parentId, afterNodeId, pageSize, cancellationToken);
    }

    public async Task<CachedNodeResponse> LoadAsync(Guid nodeId, CancellationToken cancellationToken) =>
        await treeRepository.LoadAsync(nodeId, cancellationToken)
        ?? throw new NodeNotFoundException("This node no longer exists. Refresh the database tree.");

    public Task<ApplyChangesResponse> ApplyAsync(
        ApplyChangesRequest requestedChanges,
        CancellationToken cancellationToken)
    {
        ChangeSetValidator.Validate(requestedChanges);

        return unitOfWork.ExecuteAsync(async () =>
        {
            var expectedVersionsByNodeId = requestedChanges.Updates
                .Select(nodeUpdate => new NodeVersionResponse(nodeUpdate.Id, nodeUpdate.Version))
                .Concat(requestedChanges.Deletes.Select(nodeDeletion =>
                    new NodeVersionResponse(nodeDeletion.Id, nodeDeletion.Version)))
                .ToDictionary(nodeVersion => nodeVersion.Id, nodeVersion => nodeVersion.Version);

            var nodeIdsToCheckForConflicts = expectedVersionsByNodeId.Keys
                .Concat(requestedChanges.Creates.Select(newNode => newNode.Id))
                .ToArray();
            var existingNodes = await treeRepository.GetForUpdateAsync(
                nodeIdsToCheckForConflicts,
                cancellationToken);

            if (existingNodes.Count != expectedVersionsByNodeId.Count ||
                existingNodes.Any(existingNode =>
                    !expectedVersionsByNodeId.TryGetValue(existingNode.Id, out var expectedVersion) ||
                    existingNode.Version != expectedVersion))
            {
                throw new TreeConflictException(TreeConflictException.ReloadMessage);
            }

            var subtreeRootIdsToDelete = requestedChanges.Deletes
                .Select(nodeDeletion => nodeDeletion.Id)
                .ToArray();
            var updatedNodeAndNewParentIds = requestedChanges.Updates
                .Select(nodeUpdate => nodeUpdate.Id)
                .Concat(requestedChanges.Creates.Select(newNode => newNode.ParentId))
                .Distinct()
                .ToArray();

            if (subtreeRootIdsToDelete.Length > 0 &&
                updatedNodeAndNewParentIds.Length > 0 &&
                await treeRepository.ContainsInSubtreesAsync(
                    subtreeRootIdsToDelete,
                    updatedNodeAndNewParentIds,
                    cancellationToken))
            {
                throw new TreeValidationException(
                    "Cannot edit or add children inside a subtree being deleted.");
            }

            var deletedNodeCount = subtreeRootIdsToDelete.Length == 0
                ? 0
                : await treeRepository.DeleteSubtreesAsync(subtreeRootIdsToDelete, cancellationToken);

            var existingNodesById = existingNodes.ToDictionary(existingNode => existingNode.Id);
            var committedNodeVersions = new List<NodeVersionResponse>();

            foreach (var nodeUpdate in requestedChanges.Updates)
            {
                var nodeToUpdate = existingNodesById[nodeUpdate.Id];
                nodeToUpdate.Rename(nodeUpdate.Value);
                committedNodeVersions.Add(new(nodeToUpdate.Id, nodeToUpdate.Version));
            }

            var newNodes = requestedChanges.Creates
                .Select(newNode => new TreeNode(newNode.Id, newNode.ParentId, newNode.Value))
                .ToArray();

            treeRepository.AddRange(newNodes);
            committedNodeVersions.AddRange(newNodes.Select(newNode =>
                new NodeVersionResponse(newNode.Id, newNode.Version)));

            return new ApplyChangesResponse(committedNodeVersions, deletedNodeCount);
        }, cancellationToken);
    }

    public Task ResetAsync(CancellationToken cancellationToken) =>
        unitOfWork.ExecuteAsync(async () =>
        {
            await treeRepository.ResetAsync(cancellationToken);

            return true;
        }, cancellationToken);
}
