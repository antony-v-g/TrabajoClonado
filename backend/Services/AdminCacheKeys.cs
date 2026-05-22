namespace RutaSegura.Services;

public static class AdminCacheKeys
{
    public const string Resumen = "admin:resumen:v2";
    public const string Alertas = "admin:alertas:v1";
    public const string Config = "admin:config:v1";
    public const string RedisEstado = "admin:redis-estado:v1";

    public static string PuntosMapa(int maxDias) => $"admin:puntos-mapa:v2:{maxDias}";

    public static async Task InvalidateAllAsync(RedisService redis)
    {
        if (!redis.IsEnabled) return;
        await redis.RemoveAsync(Resumen);
        await redis.RemoveAsync(Alertas);
        await redis.RemoveAsync(Config);
        await redis.RemoveAsync(RedisEstado);
        for (var d = 1; d <= 365; d += 30)
            await redis.RemoveAsync(PuntosMapa(d));
        await DashboardAlertasService.InvalidateAlertasCacheAsync(redis);
    }
}
