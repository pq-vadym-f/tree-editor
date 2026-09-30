using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TreeEditor.Core.Abstractions;
using TreeEditor.Core.Errors;

namespace TreeEditor.Infrastructure.Repositories;

public sealed class UnitOfWork(TreeDbContext databaseContext) : IUnitOfWork
{
    public async Task<TResult> ExecuteAsync<TResult>(
        Func<Task<TResult>> transactionalOperation,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var databaseTransaction = await databaseContext.Database.BeginTransactionAsync(
                IsolationLevel.Serializable,
                cancellationToken);

            var operationResult = await transactionalOperation();
            await databaseContext.SaveChangesAsync(cancellationToken);
            await databaseTransaction.CommitAsync(cancellationToken);

            return operationResult;
        }
        catch (Exception exception) when (IsConflict(exception))
        {
            databaseContext.ChangeTracker.Clear();
            throw new TreeConflictException(TreeConflictException.ReloadMessage, exception);
        }
    }

    private static bool IsConflict(Exception exception) => exception switch
    {
        DbUpdateConcurrencyException => true,
        PostgresException
        {
            SqlState: PostgresErrorCodes.SerializationFailure
                or PostgresErrorCodes.DeadlockDetected
                or PostgresErrorCodes.ForeignKeyViolation
                or PostgresErrorCodes.UniqueViolation
        } => true,
        DbUpdateException { InnerException: { } innerException } => IsConflict(innerException),
        _ => false
    };
}
