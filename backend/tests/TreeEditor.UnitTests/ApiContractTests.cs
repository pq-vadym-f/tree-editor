using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using TreeEditor.Api.Controllers;
using TreeEditor.Api.Middleware;
using TreeEditor.Core.Contracts;
using TreeEditor.Core.Errors;
using TreeEditor.Core.Services.Interfaces;

namespace TreeEditor.UnitTests;

public sealed class ApiContractTests
{
    [Theory]
    [InlineData(400)]
    [InlineData(404)]
    [InlineData(409)]
    [InlineData(413)]
    [InlineData(500)]
    public async Task ExceptionResponsesUseProblemDetailsWithoutLeakingInternalMessages(int statusCode)
    {
        const string internalMessage = "Host=private-db;Password=secret";
        Exception exception = statusCode switch
        {
            400 => new TreeValidationException("Values cannot contain null (NUL) characters."),
            404 => new NodeNotFoundException(internalMessage),
            409 => new TreeConflictException(internalMessage),
            413 => new BadHttpRequestException(internalMessage, StatusCodes.Status413PayloadTooLarge),
            _ => new InvalidOperationException(internalMessage)
        };

        using var services = new ServiceCollection().AddLogging().BuildServiceProvider();
        var context = new DefaultHttpContext { RequestServices = services };
        context.Request.Path = "/api/tree/apply";
        await using var responseBody = new MemoryStream();
        context.Response.Body = responseBody;
        var handler = new ApiExceptionHandler(NullLogger<ApiExceptionHandler>.Instance);

        var handled = await handler.TryHandleAsync(context, exception, CancellationToken.None);

        Assert.True(handled);
        Assert.Equal(statusCode, context.Response.StatusCode);
        Assert.StartsWith("application/problem+json", context.Response.ContentType);

        responseBody.Position = 0;
        using var response = await JsonDocument.ParseAsync(responseBody);
        var problem = response.RootElement;

        Assert.Equal(statusCode, problem.GetProperty("status").GetInt32());
        Assert.Equal("/api/tree/apply", problem.GetProperty("instance").GetString());
        Assert.DoesNotContain(internalMessage, problem.GetRawText());

        if (statusCode == 400)
        {
            Assert.Contains("NUL", problem.GetProperty("detail").GetString());
        }
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task HealthStatusReflectsDatabaseAvailabilityAndForwardsCancellation(bool available)
    {
        var serviceCollection = new ServiceCollection();
        serviceCollection.AddLogging();
        serviceCollection.AddControllers();
        using var services = serviceCollection.BuildServiceProvider();
        using var cancellation = new CancellationTokenSource();
        var healthService = new TestHealthService(available);
        var controller = new HealthController(healthService)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { RequestServices = services }
            }
        };

        var response = await controller.Get(cancellation.Token);

        Assert.Equal(cancellation.Token, healthService.ReceivedCancellationToken);

        if (available)
        {
            var result = Assert.IsType<OkObjectResult>(response.Result);
            Assert.Equal(new HealthResponse("ok", "ok"), result.Value);
        }
        else
        {
            var result = Assert.IsType<ObjectResult>(response.Result);
            var problem = Assert.IsType<ProblemDetails>(result.Value);
            Assert.Equal(StatusCodes.Status503ServiceUnavailable, result.StatusCode);
            Assert.Equal(StatusCodes.Status503ServiceUnavailable, problem.Status);
            Assert.Equal("The database is unavailable.", problem.Detail);
        }
    }

    private sealed class TestHealthService(bool available) : IHealthService
    {
        public CancellationToken ReceivedCancellationToken
        {
            get; private set;
        }

        public Task<bool> IsDatabaseAvailableAsync(CancellationToken cancellationToken)
        {
            ReceivedCancellationToken = cancellationToken;

            return Task.FromResult(available);
        }
    }
}
