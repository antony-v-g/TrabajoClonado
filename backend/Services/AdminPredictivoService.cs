using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;

namespace RutaSegura.Services;

/// <summary>Predicciones de riesgo por zona (ML.NET + tendencia de reportes).</summary>
public class AdminPredictivoService
{
    private readonly ApplicationDbContext _db;
    private readonly MlNetService _ml;

    public AdminPredictivoService(ApplicationDbContext db, MlNetService ml)
    {
        _db = db;
        _ml = ml;
    }

    public async Task<IReadOnlyList<PrediccionZonaDto>> GetPrediccionesAsync(
        int take = 6,
        CancellationToken ct = default)
    {
        await _ml.EnsureModelsAsync(ct);
        var n = Math.Clamp(take, 1, 12);
        var hoy = DateTime.UtcNow.Date;
        var inicio7 = hoy.AddDays(-7);
        var inicio14 = hoy.AddDays(-14);

        var recientes = await _db.Reportes
            .AsNoTracking()
            .Where(r => r.FechaReporte >= inicio7 && r.Estado != "Rechazado")
            .ToListAsync(ct);

        var anteriores = await _db.Reportes
            .AsNoTracking()
            .Where(r => r.FechaReporte >= inicio14 && r.FechaReporte < inicio7 && r.Estado != "Rechazado")
            .ToListAsync(ct);

        var grupos = recientes
            .GroupBy(r => NormalizarZona(r.Ubicacion))
            .Select(g =>
            {
                var ubicDisplay = g.OrderByDescending(x => x.FechaReporte).First().Ubicacion.Trim();
                var cnt = g.Count();
                var cntAnt = anteriores.Count(r => NormalizarZona(r.Ubicacion) == g.Key);
                var deltaPct = cntAnt == 0
                    ? (cnt >= 2 ? 100.0 : 0.0)
                    : Math.Round((cnt - cntAnt) * 100.0 / cntAnt, 1);

                var tipoDominante = g
                    .GroupBy(x => x.TipoIncidente ?? "Otro")
                    .OrderByDescending(x => x.Count())
                    .First()
                    .Key;

                var horaProm = (float)g.Average(x => x.FechaReporte.Hour + x.FechaReporte.Minute / 60.0);
                var features = ZoneFeatureBuilder.FromReporte(
                    g.OrderByDescending(x => x.FechaReporte).First(),
                    cnt);
                var ml = _ml.ClassifyZoneSafety(
                    features.CantidadReportes,
                    features.Trafico,
                    features.Iluminacion,
                    horaProm,
                    incidentesRecientes: Math.Clamp(cnt / 6f, 0f, 1f));

                var display = ZoneSafetyPresentation.ToDisplay(ml.Nivel, ml.ConfianzaPct);
                var riesgoPct = (int)Math.Clamp(
                    Math.Round(deltaPct * 0.35 + cnt * 8.0 + ml.ConfianzaPct * 0.25),
                    5,
                    99);

                var mensaje = ConstruirMensaje(ubicDisplay, cnt, cntAnt, deltaPct, tipoDominante, display.Etiqueta);

                return new PrediccionZonaDto(
                    ubicDisplay,
                    cnt,
                    cntAnt,
                    deltaPct,
                    tipoDominante,
                    display.Nivel,
                    display.Etiqueta,
                    display.IndicadorVisual,
                    ml.ConfianzaPct,
                    riesgoPct,
                    mensaje,
                    deltaPct >= 25 || cnt >= 4,
                    DateTime.UtcNow);
            })
            .OrderByDescending(x => x.RiesgoPredichoPct)
            .ThenByDescending(x => x.Reportes7d)
            .Take(n)
            .ToList();

        return grupos;
    }

    public static string ConstruirMensaje(
        string ubicacion,
        int cnt,
        int cntAnt,
        double deltaPct,
        string tipoDominante,
        string nivelZona)
    {
        if (cnt == 0)
            return "Sin reportes recientes en esta zona.";

        if (deltaPct >= 50 && cnt >= 2)
            return $"⚠️ Posible aumento de incidentes en {Truncar(ubicacion, 60)} (+{deltaPct:0.#}% vs semana anterior, {cnt} reporte(s), tipo frecuente: {tipoDominante}).";

        if (cnt >= 4)
            return $"⚠️ Zona crítica: {Truncar(ubicacion, 60)} con {cnt} reportes en 7 días. Nivel ML: {nivelZona}.";

        if (deltaPct > 0 && cntAnt > 0)
            return $"Tendencia al alza en {Truncar(ubicacion, 55)} (+{deltaPct:0.#}%). Monitorear especialmente {tipoDominante.ToLowerInvariant()}.";

        return $"Patrón estable en {Truncar(ubicacion, 55)} ({cnt} reporte(s), nivel {nivelZona}).";
    }

    private static string NormalizarZona(string? u)
    {
        if (string.IsNullOrWhiteSpace(u)) return "desconocida";
        return u.Trim().ToLowerInvariant();
    }

    private static string Truncar(string s, int max)
    {
        var t = s.Trim();
        return t.Length <= max ? t : $"{t[..(max - 1)].TrimEnd()}…";
    }
}

public record PrediccionZonaDto(
    string Ubicacion,
    int Reportes7d,
    int ReportesSemanaAnterior,
    double DeltaPct,
    string TipoIncidenteDominante,
    string NivelZonaMl,
    string EtiquetaZona,
    string IndicadorZona,
    double ConfianzaMlPct,
    int RiesgoPredichoPct,
    string MensajePredictivo,
    bool RequiereAlerta,
    DateTime GeneradoEnUtc);
