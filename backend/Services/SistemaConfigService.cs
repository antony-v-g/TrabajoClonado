using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;

namespace RutaSegura.Services;

/// <summary>Lee reglas de ConfiguracionSistema y las aplica en mapa, alertas y rutas.</summary>
public class SistemaConfigService
{
    private readonly ApplicationDbContext _db;

    public SistemaConfigService(ApplicationDbContext db) => _db = db;

    public async Task<ConfiguracionSistema> GetAsync(CancellationToken ct = default)
    {
        var row = await _db.ConfiguracionSistema.AsNoTracking().FirstOrDefaultAsync(ct);
        if (row != null) return row;

        return new ConfiguracionSistema
        {
            Id = 1,
            PesoZonasOscurasPct = 40,
            CaducidadReporteMenorHoras = 24,
            AutoAprobarConfianzaMinPct = 85,
            UmbralRiesgoAlertaAltaPct = 80,
            UmbralRiesgoAlertaMediaPct = 50,
        };
    }

    public static string PrioridadDesdeRiesgoPct(
        int riesgoPct,
        int umbralAlta,
        int umbralMedia)
    {
        var alta = Math.Clamp(umbralAlta, 1, 100);
        var media = Math.Clamp(umbralMedia, 1, alta - 1);
        if (riesgoPct >= alta) return "alta";
        if (riesgoPct >= media) return "media";
        return "baja";
    }

    public static bool EsReporteMenor(DateTime fechaReporteUtc, int caducidadHoras) =>
        (DateTime.UtcNow - fechaReporteUtc).TotalHours < Math.Clamp(caducidadHoras, 1, 168);

    /// <summary>Ajusta iluminación y cantidad según peso admin y reportes de zona oscura en el área.</summary>
    public static ZoneFeatures AplicarPesoZonasOscuras(
        ZoneFeatures baseFeatures,
        int pesoZonasOscurasPct,
        int reportesZonaOscuraEnZona)
    {
        var peso = Math.Clamp(pesoZonasOscurasPct, 0, 100) / 100f;
        var iluminacion = baseFeatures.Iluminacion;
        if (reportesZonaOscuraEnZona > 0 || iluminacion < 0.35f)
        {
            var factor = 1f - peso * 0.75f;
            iluminacion = Math.Clamp(iluminacion * factor, 0.05f, 1f);
        }

        var extra = reportesZonaOscuraEnZona * peso * 0.12f;
        var cantidad = Math.Clamp(baseFeatures.CantidadReportes + extra, 0.05f, 1f);
        return baseFeatures with
        {
            Iluminacion = iluminacion,
            CantidadReportes = cantidad,
        };
    }

    public static int ContarZonaOscuraEnLista(IEnumerable<Reporte> reportes) =>
        reportes.Count(r =>
            (r.TipoIncidente ?? "").Contains("zona", StringComparison.OrdinalIgnoreCase)
            && (r.TipoIncidente ?? "").Contains("oscur", StringComparison.OrdinalIgnoreCase));

    public async Task InvalidarCachésDependientesAsync(RedisService redis)
    {
        await AdminCacheKeys.InvalidateAllAsync(redis);
        await DashboardAlertasService.InvalidateAlertasCacheAsync(redis);
        for (var take = 1; take <= 100; take++)
        {
            for (var days = 1; days <= 365; days += 15)
                await redis.RemoveAsync($"mapa:incidentes:v2:{days}:{take}");
        }
    }
}
