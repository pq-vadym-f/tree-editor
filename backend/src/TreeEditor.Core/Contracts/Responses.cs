using System.ComponentModel;

namespace TreeEditor.Core.Contracts;

[Description("A database node with an indication of whether its children can be expanded.")]
public sealed record NodeResponse(Guid Id, Guid? ParentId, string Value, long Version, bool HasChildren);

[Description("A node loaded for local editing, with ancestor IDs ordered from root to parent.")]
public sealed record CachedNodeResponse(Guid Id, Guid? ParentId, string Value, long Version, Guid[] AncestorIds);

[Description("A page of direct children. NextCursor is null when no further page exists.")]
public sealed record NodeListResponse(IReadOnlyList<NodeResponse> Items, Guid? NextCursor);

[Description("The committed version of a created or updated node.")]
public sealed record NodeVersionResponse(Guid Id, long Version);

[Description("Committed node versions and the total number of nodes deleted by an atomic batch.")]
public sealed record ApplyChangesResponse(IReadOnlyList<NodeVersionResponse> Versions, int DeletedCount);

[Description("The API and database availability reported by the health endpoint.")]
public sealed record HealthResponse(string Api, string Database);
