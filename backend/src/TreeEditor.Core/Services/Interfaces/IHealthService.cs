namespace TreeEditor.Core.Services.Interfaces;

public interface IHealthService
{
    Task<bool> IsDatabaseAvailableAsync(CancellationToken cancellationToken);
}
