using StackExchange.Redis;

namespace RutaSegura.Services;

public class RedisService
{
    private readonly IDatabase? _database;
    private readonly bool _enabled;
    private readonly ILogger<RedisService> _logger;

    public RedisService(IConfiguration configuration, ILogger<RedisService> logger)
    {
        _logger = logger;
        var connectionString = BuildConnectionString(configuration);

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            _logger.LogWarning("Redis deshabilitado: falta Redis:ConnectionString");
            _enabled = false;
            return;
        }

        try
        {
            var options = ConfigurationOptions.Parse(connectionString);
            options.AbortOnConnectFail = false;
            options.ConnectTimeout = 10000;
            options.Ssl = options.Ssl || LooksLikeRedisCloud(options);

            var redis = ConnectionMultiplexer.Connect(options);
            _database = redis.GetDatabase();
            _enabled = true;
            _logger.LogInformation(
                "Redis conectado ({Host})",
                options.EndPoints.FirstOrDefault()?.ToString() ?? "redis");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "No se pudo conectar a Redis");
            _enabled = false;
        }
    }

    public bool IsEnabled => _enabled;

    /// <summary>
    /// Acepta: localhost:6379, redis://user:pass@host:port, host:port,password=x,ssl=True
    /// o solo host:port + Redis:Password (Redis Cloud / Redis Labs).
    /// </summary>
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
                parts.Add("abortConnect=false");
                return string.Join(',', parts);
            }
        }

        return raw;
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

    public async Task SetStringAsync(string key, string value, TimeSpan? ttl = null)
    {
        if (!_enabled || _database is null) return;

        try
        {
            await _database.StringSetAsync(key, value, ttl);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis SET falló ({Key})", key);
        }
    }

    public async Task<string?> GetStringAsync(string key)
    {
        if (!_enabled || _database is null) return null;

        try
        {
            var value = await _database.StringGetAsync(key);
            return value.HasValue ? value.ToString() : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis GET falló ({Key})", key);
        }

        return null;
    }

    public async Task RemoveAsync(string key)
    {
        if (!_enabled || _database is null) return;

        try
        {
            await _database.KeyDeleteAsync(key);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Redis REMOVE falló ({Key})", key);
        }
    }
}
