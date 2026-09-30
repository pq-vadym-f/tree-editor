using TreeEditor.Core.Errors;

namespace TreeEditor.Core.Domain;

public sealed class TreeNode
{
    public const int MaxValueLength = 500;

    private TreeNode()
    {
    }

    public TreeNode(Guid nodeId, Guid? parentId, string nodeValue)
    {
        if (nodeId == Guid.Empty || parentId == Guid.Empty || parentId == nodeId)
        {
            throw new TreeValidationException(
                "A node must have a nonempty ID and cannot be its own parent.");
        }

        ValidateValue(nodeValue);

        Id = nodeId;
        ParentId = parentId;
        Value = nodeValue;
    }

    public Guid Id
    {
        get; private set;
    }

    public Guid? ParentId
    {
        get; private set;
    }

    public string Value { get; private set; } = "";

    public long Version { get; private set; } = 1;

    public void Rename(string nodeValue)
    {
        ValidateValue(nodeValue);

        Value = nodeValue;
        Version = checked(Version + 1);
    }

    public static void ValidateValue(string? nodeValue)
    {
        if (string.IsNullOrWhiteSpace(nodeValue) || nodeValue.Length > MaxValueLength)
        {
            throw new TreeValidationException(
                $"Values must contain 1 to {MaxValueLength} characters and cannot be blank.");
        }

        if (nodeValue.Contains('\0'))
        {
            throw new TreeValidationException("Values cannot contain null (NUL) characters.");
        }
    }
}
