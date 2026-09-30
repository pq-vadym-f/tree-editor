using System.ComponentModel;
using System.Reflection;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Middleware;
using TreeEditor.Core.Abstractions;
using TreeEditor.Core.Services;
using TreeEditor.Core.Services.Interfaces;
using TreeEditor.Infrastructure;
using TreeEditor.Infrastructure.Repositories;
using TreeEditor.Infrastructure.Services;

var applicationBuilder = WebApplication.CreateBuilder(args);
var databaseConnectionString = applicationBuilder.Configuration.GetConnectionString("TreeEditor")
    ?? throw new InvalidOperationException("Missing TreeEditor connection string.");

applicationBuilder.Services.AddDbContext<TreeDbContext>(contextOptions =>
    contextOptions.UseNpgsql(databaseConnectionString));
applicationBuilder.Services.AddScoped<ITreeRepository, TreeRepository>();
applicationBuilder.Services.AddScoped<IUnitOfWork, UnitOfWork>();
applicationBuilder.Services.AddScoped<ITreeService, TreeService>();
applicationBuilder.Services.AddScoped<IHealthService, HealthService>();
applicationBuilder.Services.AddScoped<IDatabaseInitializer, DatabaseInitializer>();

applicationBuilder.Services.AddControllers()
    .AddJsonOptions(jsonOptions =>
    {
        jsonOptions.JsonSerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
        jsonOptions.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

applicationBuilder.Services.ConfigureHttpJsonOptions(jsonOptions =>
{
    jsonOptions.SerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
    jsonOptions.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});

applicationBuilder.Services.AddOpenApi(options =>
{
    options.AddSchemaTransformer((schema, context, cancellationToken) =>
    {
        if (schema.Description is null &&
            context.JsonTypeInfo.Type.GetCustomAttribute<DescriptionAttribute>() is { } description)
        {
            schema.Description = description.Description;
        }

        return Task.CompletedTask;
    });
});

applicationBuilder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
        context.ProblemDetails.Instance = context.HttpContext.Request.Path;
});
applicationBuilder.Services.AddExceptionHandler<ApiExceptionHandler>();

var application = applicationBuilder.Build();

await using (var initializationScope = application.Services.CreateAsyncScope())
{
    await initializationScope.ServiceProvider
        .GetRequiredService<IDatabaseInitializer>()
        .InitializeAsync(application.Lifetime.ApplicationStopping);
}

application.UseExceptionHandler();
application.UseStatusCodePages();
application.MapControllers();

if (application.Environment.IsDevelopment())
{
    application.MapOpenApi();
}

application.Run();
