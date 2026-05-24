namespace RutaSegura.Services;

public static class AdminCacheKeys
{
    public const string Resumen = "admin:resumen:v2";
    public const string Alertas = "admin:alertas:v1";
    public const string Config = "admin:config:v1";
    public const string RedisEstado = "admin:redis-estado:v1";

    /** Días usados en mapa admin (60), mapa usuario (30), etc. */
    private static readonly int[] PuntosMapaDias =
        [1, 7, 14, 30, 60, 90, 120, 180, 365];

    public static string PuntosMapa(int maxDias) => $"admin:puntos-mapa:v3:{maxDias}";

    public static async Task InvalidatePuntosMapaAsync(RedisService redis)
    {
        if (!redis.IsEnabled) return;
        foreach (var d in PuntosMapaDias)
        {
            await redis.RemoveAsync(PuntosMapa(d));
            await redis.RemoveAsync($"admin:puntos-mapa:v2:{d}");
        }
    }

    public static async Task InvalidateAllAsync(RedisService redis)
    {
        if (!redis.IsEnabled) return;
        await redis.RemoveAsync(Resumen);
        await redis.RemoveAsync(Alertas);
        await redis.RemoveAsync(Config);
        await redis.RemoveAsync(RedisEstado);
        await InvalidatePuntosMapaAsync(redis);
        await DashboardAlertasService.InvalidateAlertasCacheAsync(redis);
    }
}
