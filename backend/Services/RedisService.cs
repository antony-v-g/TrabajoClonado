using StackExchange.Redis;

namespace RutaSegura.Services;

public class RedisService
{
    private readonly IDatabase? _database;
    private readonly IConnectionMultiplexer? _multiplexer;
    private readonly bool _configured;
    private volatile bool _operational;
    private readonly ILogger<RedisService> _logger;
    private readonly object _disableLock = new();

    public RedisService(IConfiguration configuration, ILogger<RedisService> logger)
    {
        _logger = logger;
        var connectionString = BuildConnectionString(configuration);

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            _logger.LogWarning(
                "Redis deshabilitado: falta Redis:ConnectionString. La app usará solo SQLite.");
            _configured = false;
            _operational = false;
            return;
        }

        _configured = true;

        try
        {
            var options = ConfigurationOptions.Parse(connectionString);
            var isLocal = IsLocalEndpoint(options);
            options.AbortOnConnectFail = isLocal;
            options.ConnectTimeout = isLocal ? 2500 : 10000;
            options.SyncTimeout = isLocal ? 2500 : 5000;
            options.AsyncTimeout = isLocal ? 2500 : 5000;
            options.Ssl = options.Ssl || LooksLikeRedisCloud(options);

            var redis = ConnectionMultiplexer.Connect(options);
            var db = redis.GetDatabase();
            var pingMs = db.Ping().TotalMilliseconds;

            _multiplexer = redis;
            _database = db;
            _operational = true;
            _logger.LogInformation(
                "Redis operativo ({Host}, ping {PingMs:F0} ms)",
                options.EndPoints.FirstOrDefault()?.ToString() ?? "redis",
                pingMs);
        }
        catch (Exception ex)
        {
            _operational = false;
            _logger.LogWarning(
                ex,
                "Redis no disponible en este equipo. La app seguirá con SQLite (sin caché). "
                    + "Para activarlo: inicia Redis en localhost:6379 (Docker: docker run -d -p 6379:6379 redis) "
                    + "o vacía Redis:ConnectionString en appsettings.Development.json.");
        }
    }

    /// <summary>Redis configurado y respondiendo ping.</summary>
    public bool IsEnabled => _configured && _operational;

    internal static string BuildConnectionString(IConfiguration configuration)
    {
        var raw = configuration["Redis:ConnectionString"]?.Trim();
        if (string.IsNullOrWhiteSpace(raw))
            return string.Empty;

        if (raw.Contains("password=", StringComparison.OrdinalIgnoreCase)
            || raw.Contains('@')
            || raw.StartsWith("redis://", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("rediss://", StringComparison.OrdinalIgnoreCase))
            return raw;

        var password = configuration["Redis:Password"]?.Trim();
        if (!raw.Contains(',') && raw.Contains('.'))
        {
            var colon = raw.LastIndexOf(':');
            if (colon > 0 && int.TryParse(raw[(colon + 1)..], out var port))
            {
                var host = raw[..colon];
                var isCloud = host.Contains("redislabs.com", StringComparison.OrdinalIgnoreCase)
                    || port is 14083 or 6380 or 18100;

                var parts = new List<string> { $"{host}:{port}" };
                if (!string.IsNullOrEmpty(password))
                    parts.Add($"password={password}");
                if (isCloud)
                    parts.Add("ssl=True");
                if (!isCloud)
                    parts.Add("abortConnect=true");
                return string.Join(',', parts);
            }
        }

        if (raw.StartsWith("localhost", StringComparison.OrdinalIgnoreCase)
            || raw.StartsWith("127.0.0.1", StringComparison.OrdinalIgnoreCase))
        {
            return raw.Contains(',') ? raw : $"{raw},abortConnect=true";
        }

        return raw;
    }

    private static bool IsLocalEndpoint(ConfigurationOptions options)
    {
        foreach (var ep in options.EndPoints)
        {
            var s = ep.ToString() ?? "";
            if (s.StartsWith("localhost", StringComparison.OrdinalIgnoreCase)
                || s.StartsWith("127.0.0.1", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    private static bool LooksLikeRedisCloud(ConfigurationOptions options)
    {
        foreach (var ep in options.EndPoints)
        {
            var s = ep.ToString() ?? "";
            if (s.Contains("redislabs.com", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    private void DisableAfterFailure(Exception ex, string operation, string key)
    {
        lock (_disableLock)
        {
            if (!_operational) return;
            _operational = false;
            _logger.LogWarning(
                ex,
                "Redis dejó de responder ({Operation} {Key}). Caché desactivada; usando SQLite.",
                operation,
                key);
        }

        try
        {
            _multiplexer?.Dispose();
        }
        catch
        {
            /* ignore */
        }
    }

    public async Task SetStringAsync(string key, string value, TimeSpan? ttl = null)
    {
        if (!IsEnabled || _database is null) return;

        try
        {
            await _database.StringSetAsync(key, value, ttl);
        }
        catch (Exception ex)
        {
            DisableAfterFailure(ex, "SET", key);
        }
    }

    public async Task<string?> GetStringAsync(string key)
    {
        if (!IsEnabled || _database is null) return null;

        try
        {
            var value = await _database.StringGetAsync(key);
            return value.HasValue ? value.ToString() : null;
        }
        catch (Exception ex)
        {
            DisableAfterFailure(ex, "GET", key);
        }

        return null;
    }

    public async Task RemoveAsync(string key)
    {
        if (!IsEnabled || _database is null) return;

        try
        {
            await _database.KeyDeleteAsync(key);
        }
        catch (Exception ex)
        {
            DisableAfterFailure(ex, "REMOVE", key);
        }
    }
}
