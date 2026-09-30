using Microsoft.EntityFrameworkCore;

namespace TreeEditor.Infrastructure;

public sealed class DatabaseInitializer(TreeDbContext databaseContext) : IDatabaseInitializer
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await databaseContext.Database.MigrateAsync(cancellationToken);

        await using var initializationTransaction =
            await databaseContext.Database.BeginTransactionAsync(cancellationToken);
        await databaseContext.Database.ExecuteSqlRawAsync(
            "SELECT pg_advisory_xact_lock(843291)",
            cancellationToken);

        if (!await databaseContext.Initialization.AnyAsync(cancellationToken))
        {
            databaseContext.Nodes.AddRange(SampleTree.Create());
            databaseContext.Initialization.Add(new TreeInitialization());
            await databaseContext.SaveChangesAsync(cancellationToken);
        }

        await initializationTransaction.CommitAsync(cancellationToken);
    }
}
