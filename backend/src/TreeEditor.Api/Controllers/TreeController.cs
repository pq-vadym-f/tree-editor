using Microsoft.AspNetCore.Mvc;
using TreeEditor.Core.Contracts;
using TreeEditor.Core.Services.Interfaces;

namespace TreeEditor.Api.Controllers;

[ApiController]
[Route("api/tree")]
[ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError, "application/problem+json")]
public sealed class TreeController(ITreeService treeService) : ControllerBase
{
    [HttpGet("children", Name = "GetTreeChildren")]
    [EndpointSummary("List direct children of a node")]
    [EndpointDescription("Omit parentId to list roots. Use the returned nextCursor as after to load another page.")]
    [ProducesResponseType<NodeListResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    public Task<NodeListResponse> Children(
        [FromQuery] Guid? parentId,
        [FromQuery(Name = "after")] Guid? afterNodeId,
        CancellationToken cancellationToken,
        [FromQuery(Name = "limit")] int pageSize = 50) =>
        treeService.GetChildrenAsync(parentId, afterNodeId, pageSize, cancellationToken);

    [HttpGet("nodes/{id:guid}", Name = "GetTreeNode")]
    [EndpointSummary("Load a node for local editing")]
    [EndpointDescription("Returns one node and its ancestor IDs without loading its descendants.")]
    [ProducesResponseType<CachedNodeResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound, "application/problem+json")]
    public Task<CachedNodeResponse> Load(
        [FromRoute(Name = "id")] Guid nodeId,
        CancellationToken cancellationToken) =>
        treeService.LoadAsync(nodeId, cancellationToken);

    [HttpPost("apply", Name = "ApplyTreeChanges")]
    [EndpointSummary("Apply a batch of cached changes")]
    [EndpointDescription("Commits 1 to 1,000 changes atomically. Stale versions or missing references reject the entire batch.")]
    [ProducesResponseType<ApplyChangesResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status413PayloadTooLarge, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status415UnsupportedMediaType, "application/problem+json")]
    [RequestSizeLimit(2_000_000)]
    public Task<ApplyChangesResponse> Apply(
        ApplyChangesRequest requestedChanges,
        CancellationToken cancellationToken) =>
        treeService.ApplyAsync(requestedChanges, cancellationToken);

    [HttpPost("reset", Name = "ResetTree")]
    [EndpointSummary("Restore the sample tree")]
    [EndpointDescription("Replaces all database nodes with fresh sample data and invalidates previously loaded versions.")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict, "application/problem+json")]
    public async Task<IActionResult> Reset(CancellationToken cancellationToken)
    {
        await treeService.ResetAsync(cancellationToken);

        return NoContent();
    }
}
