using System.Globalization;
using RutaSegura.Models;

namespace RutaSegura.Services;

/// <summary>Asigna lat/lng a reportes usando la dirección escrita cuando falta GPS.</summary>
public class ReporteGeocodingService
{
    private readonly ExternalApisService _external;
    private readonly ILogger<ReporteGeocodingService> _logger;

    public ReporteGeocodingService(
        ExternalApisService external,
        ILogger<ReporteGeocodingService> logger)
    {
        _external = external;
        _logger = logger;
    }

    public static bool TieneCoordenadas(Reporte reporte) =>
        !string.IsNullOrWhiteSpace(reporte.Latitud)
        && !string.IsNullOrWhiteSpace(reporte.Longitud);

    public static bool EsDireccionGeocodificable(string? ubicacion)
    {
        if (string.IsNullOrWhiteSpace(ubicacion)) return false;
        var u = ubicacion.Trim();
        if (u.Length < 8) return false;

        var lower = u.ToLowerInvariant();
        if (lower.Contains("indica o usa gps", StringComparison.Ordinal)) return false;
        if (lower.StartsWith("gps:", StringComparison.Ordinal)) return false;
        if (lower is "lima, perú" or "lima, peru" or "mi ubicación actual") return false;

        return true;
    }

    /// <summary>Completa Latitud/Longitud en memoria. Devuelve true si se resolvieron coords nuevas.</summary>
    public async Task<bool> EnsureCoordinatesAsync(
        Reporte reporte,
        CancellationToken ct = default)
    {
        if (TieneCoordenadas(reporte)) return false;
        if (!EsDireccionGeocodificable(reporte.Ubicacion)) return false;

        var query = reporte.Ubicacion!.Contains("Perú", StringComparison.OrdinalIgnoreCase)
            || reporte.Ubicacion.Contains("Peru", StringComparison.OrdinalIgnoreCase)
            ? reporte.Ubicacion.Trim()
            : $"{reporte.Ubicacion.Trim()}, Lima, Perú";

        var (ok, lat, lng) = await _external.TryResolveCoordinatesAsync(query, ct);
        if (!ok)
        {
            _logger.LogDebug(
                "Geocodificación omitida para reporte {Id} ({Ubicacion})",
                reporte.Id,
                reporte.Ubicacion);
            return false;
        }

        reporte.Latitud = lat.ToString(CultureInfo.InvariantCulture);
        reporte.Longitud = lng.ToString(CultureInfo.InvariantCulture);
        _logger.LogInformation(
            "Coords asignadas al reporte {Id}: {Lat}, {Lng}",
            reporte.Id,
            reporte.Latitud,
            reporte.Longitud);
        return true;
    }

}
