using TreeEditor.Core.Contracts;

namespace TreeEditor.Core.Services.Interfaces;

public interface ITreeService
{
    Task<NodeListResponse> GetChildrenAsync(
        Guid? parentId,
        Guid? afterNodeId,
        int pageSize,
        CancellationToken cancellationToken);

    Task<CachedNodeResponse> LoadAsync(Guid nodeId, CancellationToken cancellationToken);

    Task<ApplyChangesResponse> ApplyAsync(ApplyChangesRequest requestedChanges, CancellationToken cancellationToken);

    Task ResetAsync(CancellationToken cancellationToken);
}
