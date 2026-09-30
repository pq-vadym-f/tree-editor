using TreeEditor.Core.Domain;

namespace TreeEditor.Infrastructure;

internal static class SampleTree
{
    public static IReadOnlyList<TreeNode> Create()
    {
        (string Value, int? ParentIndex)[] sampleNodeDefinitions =
        [
            ("World", null),

            ("Europe", 0),
            ("Ukraine", 1),
            ("Kyiv", 2),
            ("Podil", 3),
            ("Lviv", 2),
            ("Germany", 1),
            ("Berlin", 6),

            ("Asia", 0),
            ("Japan", 8),
            ("Tokyo", 9),
            ("Shinjuku", 10),

            ("North America", 0),
            ("Canada", 12),
            ("Toronto", 13)
        ];

        var generatedNodeIds = sampleNodeDefinitions.Select(_ => Guid.NewGuid()).ToArray();

        return sampleNodeDefinitions
            .Select((nodeDefinition, nodeIndex) => new TreeNode(
                generatedNodeIds[nodeIndex],
                nodeDefinition.ParentIndex is int parentIndex ? generatedNodeIds[parentIndex] : null,
                nodeDefinition.Value))
            .ToArray();
    }
}
