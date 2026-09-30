using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using TreeEditor.Core.Domain;

namespace TreeEditor.Core.Contracts;

[Description("A new node with a client-generated ID and an existing or newly created parent.")]
public sealed record CreateNodeRequest
{
    public required Guid Id
    {
        get; init;
    }

    public required Guid ParentId
    {
        get; init;
    }

    [Required, MaxLength(TreeNode.MaxValueLength)]
    public required string Value
    {
        get; init;
    }
}

[Description("A value change with the last loaded node version for concurrency checks.")]
public sealed record UpdateNodeRequest
{
    public required Guid Id
    {
        get; init;
    }

    [Range(1, long.MaxValue)]
    public required long Version
    {
        get; init;
    }

    [Required, MaxLength(TreeNode.MaxValueLength)]
    public required string Value
    {
        get; init;
    }
}

[Description("A subtree deletion with the last loaded version of its root node.")]
public sealed record DeleteNodeRequest
{
    public required Guid Id
    {
        get; init;
    }

    [Range(1, long.MaxValue)]
    public required long Version
    {
        get; init;
    }
}

[Description("An atomic batch of 1 to 1,000 node creations, value changes, and subtree deletions.")]
public sealed record ApplyChangesRequest
{
    [Required]
    public required CreateNodeRequest[] Creates
    {
        get; init;
    }

    [Required]
    public required UpdateNodeRequest[] Updates
    {
        get; init;
    }

    [Required]
    public required DeleteNodeRequest[] Deletes
    {
        get; init;
    }
}
