using TreeEditor.Core.Contracts;
using TreeEditor.Core.Domain;
using TreeEditor.Core.Errors;

namespace TreeEditor.Core.Services;

internal static class ChangeSetValidator
{
    public static void Validate(ApplyChangesRequest requestedChanges)
    {
        if (requestedChanges.Creates is null ||
            requestedChanges.Updates is null ||
            requestedChanges.Deletes is null)
        {
            throw new TreeValidationException("Creates, updates, and deletes arrays are required.");
        }

        var totalChangeCount = requestedChanges.Creates.Length
            + requestedChanges.Updates.Length
            + requestedChanges.Deletes.Length;

        if (totalChangeCount is < 1 or > 1000)
        {
            throw new TreeValidationException("Apply between 1 and 1000 changes at a time.");
        }

        var seenChangeNodeIds = new HashSet<Guid>();

        void ValidateUniqueNodeId(Guid nodeId)
        {
            if (nodeId == Guid.Empty || !seenChangeNodeIds.Add(nodeId))
            {
                throw new TreeValidationException(
                    "Change IDs must be nonempty and unique across the request.");
            }
        }

        foreach (var newNode in requestedChanges.Creates)
        {
            if (newNode is null)
            {
                throw new TreeValidationException("A change cannot be null.");
            }

            ValidateUniqueNodeId(newNode.Id);
            TreeNode.ValidateValue(newNode.Value);

            if (newNode.ParentId == Guid.Empty)
            {
                throw new TreeValidationException("New nodes must have a parent.");
            }
        }

        foreach (var nodeUpdate in requestedChanges.Updates)
        {
            if (nodeUpdate is null)
            {
                throw new TreeValidationException("A change cannot be null.");
            }

            ValidateUniqueNodeId(nodeUpdate.Id);
            TreeNode.ValidateValue(nodeUpdate.Value);

            if (nodeUpdate.Version < 1)
            {
                throw new TreeValidationException("A valid node version is required.");
            }
        }

        foreach (var nodeDeletion in requestedChanges.Deletes)
        {
            if (nodeDeletion is null)
            {
                throw new TreeValidationException("A change cannot be null.");
            }

            ValidateUniqueNodeId(nodeDeletion.Id);

            if (nodeDeletion.Version < 1)
            {
                throw new TreeValidationException("A valid node version is required.");
            }
        }

        var newParentIdsByNodeId = requestedChanges.Creates
            .ToDictionary(newNode => newNode.Id, newNode => newNode.ParentId);
        var validatedNodeIds = new HashSet<Guid>();

        foreach (var nodeId in newParentIdsByNodeId.Keys)
        {
            var currentAncestorPathIds = new HashSet<Guid>();
            var currentNodeId = nodeId;

            while (newParentIdsByNodeId.TryGetValue(currentNodeId, out var parentNodeId) &&
                !validatedNodeIds.Contains(currentNodeId))
            {
                if (!currentAncestorPathIds.Add(currentNodeId))
                {
                    throw new TreeValidationException("New nodes cannot form a cycle.");
                }

                currentNodeId = parentNodeId;
            }

            validatedNodeIds.UnionWith(currentAncestorPathIds);
        }
    }
}
