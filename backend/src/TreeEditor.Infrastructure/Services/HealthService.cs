using Microsoft.EntityFrameworkCore;
using TreeEditor.Core.Services.Interfaces;

namespace TreeEditor.Infrastructure.Services;

public sealed class HealthService(TreeDbContext databaseContext) : IHealthService
{
    public Task<bool> IsDatabaseAvailableAsync(CancellationToken cancellationToken) =>
        databaseContext.Database.CanConnectAsync(cancellationToken);
}
