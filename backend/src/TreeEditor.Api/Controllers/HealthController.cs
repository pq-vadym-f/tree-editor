using Microsoft.AspNetCore.Mvc;
using TreeEditor.Core.Contracts;
using TreeEditor.Core.Services.Interfaces;

namespace TreeEditor.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed class HealthController(IHealthService healthService) : ControllerBase
{
    [HttpGet(Name = "GetHealth")]
    [EndpointSummary("Check API and database availability")]
    [EndpointDescription("Returns availability when PostgreSQL can be reached, or a 503 problem response.")]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable, "application/problem+json")]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status500InternalServerError, "application/problem+json")]
    public async Task<ActionResult<HealthResponse>> Get(CancellationToken cancellationToken)
    {
        if (!await healthService.IsDatabaseAvailableAsync(cancellationToken))
        {
            return Problem(
                detail: "The database is unavailable.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        return Ok(new HealthResponse("ok", "ok"));
    }
}
