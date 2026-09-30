using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using TreeEditor.Core.Errors;

namespace TreeEditor.Api.Middleware;

public sealed class ApiExceptionHandler(ILogger<ApiExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext,
        Exception exception,
        CancellationToken cancellationToken)
    {
        var (statusCode, problemTitle, problemDetail) = exception switch
        {
            TreeValidationException validationException => (
                StatusCodes.Status400BadRequest,
                "Invalid changes",
                validationException.ClientDetail),
            NodeNotFoundException => (
                StatusCodes.Status404NotFound,
                "Node not found",
                "This node no longer exists. Refresh the database tree."),
            TreeConflictException => (
                StatusCodes.Status409Conflict,
                "Tree conflict",
                TreeConflictException.ReloadMessage),
            BadHttpRequestException requestException => (
                requestException.StatusCode,
                ReasonPhrases.GetReasonPhrase(requestException.StatusCode),
                "The request body is invalid or exceeds the allowed size."),
            _ => (
                StatusCodes.Status500InternalServerError,
                "Server error",
                "The server could not complete the request. Check the API logs and database connection.")
        };

        if (statusCode == StatusCodes.Status500InternalServerError)
        {
            logger.LogError(exception, "Tree request failed");
        }
        else
        {
            logger.LogWarning(exception, "Tree request rejected: {ProblemTitle}", problemTitle);
        }

        httpContext.Response.StatusCode = statusCode;
        await httpContext.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = statusCode,
            Title = problemTitle,
            Detail = problemDetail,
            Instance = httpContext.Request.Path
        }, options: null, contentType: "application/problem+json", cancellationToken: cancellationToken);

        return true;
    }
}
