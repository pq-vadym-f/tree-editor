using Npgsql;

var builder = WebApplication.CreateBuilder(args);

var connectionString =
    builder.Configuration.GetConnectionString("TreeEditor")
    ?? throw new InvalidOperationException(
        "Missing TreeEditor connection string.");

builder.Services.AddSingleton<NpgsqlDataSource>(
    _ => NpgsqlDataSource.Create(connectionString));

var app = builder.Build();

app.MapGet("/api/health", async (NpgsqlDataSource dataSource) =>
{
    await using var command = dataSource.CreateCommand("SELECT 1");
    var result = await command.ExecuteScalarAsync();

    return Results.Ok(new
    {
        api = "ok",
        database = Convert.ToInt32(result) == 1 ? "ok" : "error"
    });
});

app.Run();