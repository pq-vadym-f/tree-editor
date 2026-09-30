namespace TreeEditor.Core.Errors;

public sealed class TreeValidationException(string clientDetail) : Exception(clientDetail)
{
    public string ClientDetail { get; } = clientDetail;
}

public sealed class NodeNotFoundException(string message) : Exception(message);

public sealed class TreeConflictException(string message, Exception? innerException = null)
    : Exception(message, innerException)
{
    public const string ReloadMessage =
        "The tree changed or a referenced node no longer exists. Your cache was kept. " +
        "Discard it and load fresh nodes before trying again.";
}
