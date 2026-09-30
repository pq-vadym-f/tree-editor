using TreeEditor.Core.Domain;
using TreeEditor.Core.Errors;

namespace TreeEditor.UnitTests;

public sealed class TreeNodeTests
{
    [Theory]
    [InlineData("")]
    [InlineData(" \t\r\n")]
    [InlineData("before\0after")]
    [InlineData(null)]
    public void InvalidRenamePreservesValueAndVersion(string? invalidNodeValue)
    {
        var node = new TreeNode(Guid.NewGuid(), null, "original");

        Assert.Throws<TreeValidationException>(() => node.Rename(invalidNodeValue!));

        Assert.Equal("original", node.Value);
        Assert.Equal(1, node.Version);
    }

    [Fact]
    public void ValueLengthBoundaryIsEnforced()
    {
        var node = new TreeNode(Guid.NewGuid(), null, new string('x', 500));

        Assert.Throws<TreeValidationException>(() => node.Rename(new string('x', 501)));

        node.Rename("valid");

        Assert.Equal(2, node.Version);
    }

    [Fact]
    public void NodeCannotBeItsOwnParent()
    {
        var nodeId = Guid.NewGuid();

        Assert.Throws<TreeValidationException>(() => new TreeNode(nodeId, nodeId, "cycle"));
    }
}
