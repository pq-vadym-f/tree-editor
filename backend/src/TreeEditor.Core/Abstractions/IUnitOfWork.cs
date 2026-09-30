namespace TreeEditor.Core.Abstractions;

public interface IUnitOfWork
{
    Task<TResult> ExecuteAsync<TResult>(
        Func<Task<TResult>> transactionalOperation,
        CancellationToken cancellationToken);
}
