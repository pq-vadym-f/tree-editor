using TreeEditor.Core.Abstractions;
using TreeEditor.Core.Contracts;
using TreeEditor.Core.Domain;
using TreeEditor.Core.Errors;
using TreeEditor.Core.Services;

namespace TreeEditor.UnitTests;

public sealed class TreeServiceTests
{
    private readonly TestRepository testRepository = new();
    private readonly TestUnitOfWork testUnitOfWork = new();

    private TreeService Service => new(testRepository, testUnitOfWork);

    [Fact]
    public async Task ApplyRejectsCyclesBeforeStartingTransaction()
    {
        var firstNodeId = Guid.NewGuid();
        var secondNodeId = Guid.NewGuid();

        var requestedChanges = new ApplyChangesRequest
        {
            Creates =
            [
                new() { Id = firstNodeId, ParentId = secondNodeId, Value = "first" },
                new() { Id = secondNodeId, ParentId = firstNodeId, Value = "second" }
            ],
            Updates = [],
            Deletes = []
        };

        await Assert.ThrowsAsync<TreeValidationException>(() =>
            Service.ApplyAsync(requestedChanges, default));

        Assert.False(testUnitOfWork.TransactionStarted);
    }

    [Fact]
    public async Task ApplyRejectsIdsUsedAcrossOperations()
    {
        var nodeId = Guid.NewGuid();
        var requestedChanges = new ApplyChangesRequest
        {
            Creates = [],
            Updates = [new() { Id = nodeId, Version = 1, Value = "update" }],
            Deletes = [new() { Id = nodeId, Version = 1 }]
        };

        await Assert.ThrowsAsync<TreeValidationException>(() =>
            Service.ApplyAsync(requestedChanges, default));

        Assert.False(testUnitOfWork.TransactionStarted);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1001)]
    public async Task ApplyRejectsInvalidBatchSizes(int changeCount)
    {
        var nodeCreations = Enumerable.Range(0, changeCount)
            .Select(_ => new CreateNodeRequest
            {
                Id = Guid.NewGuid(),
                ParentId = Guid.NewGuid(),
                Value = "new"
            })
            .ToArray();

        var requestedChanges = new ApplyChangesRequest
        {
            Creates = nodeCreations,
            Updates = [],
            Deletes = []
        };

        await Assert.ThrowsAsync<TreeValidationException>(() =>
            Service.ApplyAsync(requestedChanges, default));

        Assert.False(testUnitOfWork.TransactionStarted);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    public async Task InvalidPageSizesAreRejected(int pageSize) =>
        await Assert.ThrowsAsync<TreeValidationException>(() =>
            Service.GetChildrenAsync(null, null, pageSize, default));

    [Fact]
    public async Task MissingLoadIsNotFound() =>
        await Assert.ThrowsAsync<NodeNotFoundException>(() =>
            Service.LoadAsync(Guid.NewGuid(), default));

    [Fact]
    public async Task StaleEditsFailBeforeMutatingTrackedEntities()
    {
        var node = new TreeNode(Guid.NewGuid(), null, "original");
        node.Rename("someone else's edit");
        testRepository.ExistingNodes.Add(node);

        var requestedChanges = new ApplyChangesRequest
        {
            Creates = [],
            Updates = [new() { Id = node.Id, Version = 1, Value = "stale edit" }],
            Deletes = []
        };

        await Assert.ThrowsAsync<TreeConflictException>(() =>
            Service.ApplyAsync(requestedChanges, default));

        Assert.Equal("someone else's edit", node.Value);
        Assert.False(testUnitOfWork.TransactionCompleted);
    }

    [Fact]
    public async Task MissingDeleteRootIsAConflict()
    {
        var requestedChanges = new ApplyChangesRequest
        {
            Creates = [],
            Updates = [],
            Deletes = [new() { Id = Guid.NewGuid(), Version = 1 }]
        };

        await Assert.ThrowsAsync<TreeConflictException>(() =>
            Service.ApplyAsync(requestedChanges, default));
    }

    [Fact]
    public async Task EditsWithinDeletedSubtreesFailBeforeDeletion()
    {
        var root = new TreeNode(Guid.NewGuid(), null, "root");
        testRepository.ExistingNodes.Add(root);
        testRepository.ContainsNodeInDeletedSubtree = true;

        var requestedChanges = new ApplyChangesRequest
        {
            Creates =
            [
                new()
                {
                    Id = Guid.NewGuid(),
                    ParentId = Guid.NewGuid(),
                    Value = "child below an uncached descendant"
                }
            ],
            Updates = [],
            Deletes = [new() { Id = root.Id, Version = 1 }]
        };

        await Assert.ThrowsAsync<TreeValidationException>(() =>
            Service.ApplyAsync(requestedChanges, default));

        Assert.False(testRepository.SubtreesWereDeleted);
    }

    [Fact]
    public async Task ExistingCreateIdsFailBeforeDeletingTheirSubtree()
    {
        var root = new TreeNode(Guid.NewGuid(), null, "root");
        var child = new TreeNode(Guid.NewGuid(), root.Id, "child");
        testRepository.ExistingNodes.AddRange([root, child]);

        var requestedChanges = new ApplyChangesRequest
        {
            Creates = [new() { Id = child.Id, ParentId = Guid.NewGuid(), Value = "replacement" }],
            Updates = [],
            Deletes = [new() { Id = root.Id, Version = 1 }]
        };

        await Assert.ThrowsAsync<TreeConflictException>(() =>
            Service.ApplyAsync(requestedChanges, default));

        Assert.False(testRepository.SubtreesWereDeleted);
        Assert.Empty(testRepository.AddedNodes);
        Assert.False(testUnitOfWork.TransactionCompleted);
    }

    [Fact]
    public async Task ExistingCreateIdCannotStandInForMissingUpdatedNode()
    {
        var existingNode = new TreeNode(Guid.NewGuid(), null, "existing");
        testRepository.ExistingNodes.Add(existingNode);

        var requestedChanges = new ApplyChangesRequest
        {
            Creates =
            [
                new() { Id = existingNode.Id, ParentId = Guid.NewGuid(), Value = "replacement" }
            ],
            Updates = [new() { Id = Guid.NewGuid(), Version = 1, Value = "missing" }],
            Deletes = []
        };

        await Assert.ThrowsAsync<TreeConflictException>(() =>
            Service.ApplyAsync(requestedChanges, default));

        Assert.Empty(testRepository.AddedNodes);
        Assert.False(testUnitOfWork.TransactionCompleted);
    }

    [Fact]
    public async Task NestedCreatesAndTrackedEditsReturnCommittedVersions()
    {
        var root = new TreeNode(Guid.NewGuid(), null, "root");
        testRepository.ExistingNodes.Add(root);
        var childNodeId = Guid.NewGuid();
        var grandchildNodeId = Guid.NewGuid();

        var requestedChanges = new ApplyChangesRequest
        {
            Creates =
            [
                new() { Id = grandchildNodeId, ParentId = childNodeId, Value = "grandchild" },
                new() { Id = childNodeId, ParentId = root.Id, Value = "child" }
            ],
            Updates = [new() { Id = root.Id, Version = 1, Value = "edited" }],
            Deletes = []
        };

        var applyResult = await Service.ApplyAsync(requestedChanges, default);

        Assert.True(testUnitOfWork.TransactionCompleted);
        Assert.Equal("edited", root.Value);
        Assert.Contains(new NodeVersionResponse(root.Id, 2), applyResult.Versions);
        Assert.Contains(new NodeVersionResponse(grandchildNodeId, 1), applyResult.Versions);
        Assert.Equal(
            childNodeId,
            testRepository.AddedNodes.Single(node => node.Id == grandchildNodeId).ParentId);
    }

    private sealed class TestUnitOfWork : IUnitOfWork
    {
        public bool TransactionStarted
        {
            get; private set;
        }

        public bool TransactionCompleted
        {
            get; private set;
        }

        public async Task<TResult> ExecuteAsync<TResult>(
            Func<Task<TResult>> transactionalOperation,
            CancellationToken cancellationToken)
        {
            TransactionStarted = true;
            var operationResult = await transactionalOperation();
            TransactionCompleted = true;

            return operationResult;
        }
    }

    private sealed class TestRepository : ITreeRepository
    {
        public List<TreeNode> ExistingNodes { get; } = [];

        public List<TreeNode> AddedNodes { get; } = [];

        public bool ContainsNodeInDeletedSubtree
        {
            get; set;
        }

        public bool SubtreesWereDeleted
        {
            get; private set;
        }

        public Task<IReadOnlyList<TreeNode>> GetForUpdateAsync(
            Guid[] nodeIds,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<TreeNode>>(
                ExistingNodes.Where(node => nodeIds.Contains(node.Id)).ToArray());

        public Task<CachedNodeResponse?> LoadAsync(Guid nodeId, CancellationToken cancellationToken) =>
            Task.FromResult<CachedNodeResponse?>(null);

        public Task<bool> ContainsInSubtreesAsync(
            Guid[] subtreeRootIds,
            Guid[] candidateNodeIds,
            CancellationToken cancellationToken) =>
            Task.FromResult(ContainsNodeInDeletedSubtree);

        public Task<int> DeleteSubtreesAsync(
            Guid[] subtreeRootIds,
            CancellationToken cancellationToken)
        {
            SubtreesWereDeleted = true;
            return Task.FromResult(subtreeRootIds.Length);
        }

        public void AddRange(IEnumerable<TreeNode> newNodes) => AddedNodes.AddRange(newNodes);

        public Task<NodeListResponse> GetChildrenAsync(
            Guid? parentId,
            Guid? afterNodeId,
            int pageSize,
            CancellationToken cancellationToken) =>
            throw new NotSupportedException();

        public Task ResetAsync(CancellationToken cancellationToken) =>
            throw new NotSupportedException();
    }
}
