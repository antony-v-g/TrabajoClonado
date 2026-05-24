using System.Globalization;
using System.Text.Json;

namespace RutaSegura.Services;

/// <summary>
/// Integración con APIs externas (clima, geolocalización demo).
/// Configure WEATHERAPI_API_KEY en Render o .env para clima real.
/// </summary>
public class ExternalApisService
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _config;
    private readonly RedisService _redis;
    private readonly ILogger<ExternalApisService> _logger;

    public ExternalApisService(
        IHttpClientFactory httpFactory,
        IConfiguration config,
        RedisService redis,
        ILogger<ExternalApisService> logger)
    {
        _httpFactory = httpFactory;
        _config = config;
        _redis = redis;
        _logger = logger;
    }

    public ApiCatalogResponse GetCatalog() =>
        new(
            [
                new ApiInfo(
                    "Google Maps JavaScript API",
                    "Mapas, marcadores, Places, geocodificación en el front.",
                    "VITE_GOOGLE_MAPS_API_KEY",
                    "Integrado en Mapa, Rutas, Mapa de calor admin."),
                new ApiInfo(
                    "Google Directions API",
                    "Rutas reales peatón/bici con alternativas (DirectionsService).",
                    "VITE_GOOGLE_MAPS_API_KEY + habilitar Directions API",
                    "Buscar Ruta (alternativas sobre calles reales)."),
                new ApiInfo(
                    "WeatherAPI",
                    "Clima actual (temperatura, descripción) para evaluar condiciones nocturnas.",
                    "WEATHERAPI_API_KEY",
                    "GET /api/external/clima?lat=&lon="),
                new ApiInfo(
                    "OpenStreetMap / Nominatim (demo)",
                    "Geocodificación inversa vía backend /api/Geo/reverse.",
                    "Sin clave (uso moderado)",
                    "Reportar y Mapa"),
                new ApiInfo(
                    "Redis Cloud",
                    "Caché de sesiones, dashboard, ML y alertas.",
                    "Redis__ConnectionString",
                    "Toda la API"),
                new ApiInfo(
                    "ML.NET Model Builder",
                    "Clasificación de zonas y recomendación de rutas.",
                    "Datasets/*.csv → Models/*.zip",
                    "GET /api/ml/clasificar-zona, /api/ml/recomendar-rutas"),
            ]);

    public async Task<ClimaResponse> GetClimaAsync(double lat, double lon, CancellationToken ct = default)
    {
        var key = $"ext:clima:{lat:F3}:{lon:F3}";
        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(key);
            if (!string.IsNullOrEmpty(cached))
            {
                var c = JsonSerializer.Deserialize<ClimaResponse>(cached);
                if (c is not null) return c with { Fuente = c.Fuente + " (Redis)" };
            }
        }

        var apiKey = _config["WEATHERAPI_API_KEY"]?.Trim();
        if (string.IsNullOrEmpty(apiKey))
        {
            return DemoClima(lat, lon);
        }

        try
        {
            var client = _httpFactory.CreateClient();
            var latStr = lat.ToString(CultureInfo.InvariantCulture);
            var lonStr = lon.ToString(CultureInfo.InvariantCulture);
            var url =
                $"https://api.weatherapi.com/v1/current.json?key={Uri.EscapeDataString(apiKey)}&q={latStr},{lonStr}&lang=es";
            var json = await client.GetStringAsync(url, ct);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.TryGetProperty("error", out var err))
            {
                var msg = err.TryGetProperty("message", out var m)
                    ? m.GetString()
                    : "Error WeatherAPI";
                _logger.LogWarning("WeatherAPI: {Message}", msg);
                return DemoClima(lat, lon);
            }

            var current = root.GetProperty("current");
            var desc = current.GetProperty("condition").GetProperty("text").GetString() ?? "—";
            var temp = current.GetProperty("temp_c").GetDouble();
            var precip = current.TryGetProperty("precip_mm", out var p) ? p.GetDouble() : 0;
            var vis = current.TryGetProperty("vis_km", out var v) ? v.GetDouble() : 10;
            var response = new ClimaResponse(
                Lat: lat,
                Lon: lon,
                TemperaturaC: Math.Round(temp, 1),
                Descripcion: desc,
                Fuente: "WeatherAPI",
                PrecipMm: precip,
                VisKm: vis);

            if (_redis.IsEnabled)
            {
                await _redis.SetStringAsync(key, JsonSerializer.Serialize(response), TimeSpan.FromMinutes(20));
            }

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "WeatherAPI no disponible; usando demo");
            return DemoClima(lat, lon);
        }
    }

    public TraficoDemoResponse GetTraficoDemo(string zona)
    {
        var hash = Math.Abs(zona.GetHashCode()) % 100;
        var nivel = hash > 70 ? "Alto" : hash > 40 ? "Medio" : "Bajo";
        return new TraficoDemoResponse(zona, nivel, 0.3f + hash / 100f, "Demo (sustituir por API de tráfico en producción)");
    }

    public async Task<ClimaContextoResponse> GetClimaContextoAsync(
        double lat,
        double lon,
        float? horaLocal = null,
        CancellationToken ct = default)
    {
        var clima = await GetClimaAsync(lat, lon, ct);
        var hora = horaLocal ?? ClimaImpactoAnalyzer.HoraLocalPeru();
        var impacto = ClimaImpactoAnalyzer.Analizar(clima, hora);
        return new ClimaContextoResponse(clima, impacto, hora);
    }

    /// <summary>Proxy Geocoding API (evita CORS y constructores JS en el navegador).</summary>
    public async Task<(bool Ok, JsonDocument? Doc, string? Error)> GeocodeAsync(
        string address,
        CancellationToken ct = default)
    {
        var apiKey = GetGoogleMapsApiKey();
        if (string.IsNullOrEmpty(apiKey))
        {
            return (false, null, "Configura VITE_GOOGLE_MAPS_API_KEY en .env (raíz del proyecto).");
        }

        try
        {
            var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(12);
            var url =
                "https://maps.googleapis.com/maps/api/geocode/json?" +
                $"address={Uri.EscapeDataString(address)}" +
                $"&key={Uri.EscapeDataString(apiKey)}" +
                "&region=pe&components=country:PE";
            var json = await client.GetStringAsync(url, ct);
            var doc = JsonDocument.Parse(json);
            var status = doc.RootElement.TryGetProperty("status", out var st)
                ? st.GetString()
                : null;
            if (status is "OK" or "ZERO_RESULTS")
            {
                return (true, doc, null);
            }

            var msg = status switch
            {
                "REQUEST_DENIED" =>
                    "Google rechazó la clave. Si la clave está restringida solo a referrers HTTP (localhost), "
                    + "crea otra sin restricción de aplicación para el backend, o usa «Ninguna» en desarrollo.",
                "OVER_QUERY_LIMIT" => "Límite de consultas de Geocoding API alcanzado.",
                _ => $"Geocodificación falló ({status ?? "desconocido"}).",
            };
            doc.Dispose();
            return (false, null, msg);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Geocoding API no disponible");
            return (false, null, "No se pudo contactar Geocoding API.");
        }
    }

    /// <summary>Primera coordenada de una dirección (para mapa de calor y reportes).</summary>
    public async Task<(bool Ok, double Lat, double Lng)> TryResolveCoordinatesAsync(
        string address,
        CancellationToken ct = default)
    {
        var (ok, doc, _) = await GeocodeAsync(address, ct);
        if (!ok || doc is null) return (false, 0, 0);

        using (doc)
        {
            if (!doc.RootElement.TryGetProperty("results", out var results)
                || results.GetArrayLength() == 0)
            {
                return (false, 0, 0);
            }

            var loc = results[0].GetProperty("geometry").GetProperty("location");
            return (
                true,
                loc.GetProperty("lat").GetDouble(),
                loc.GetProperty("lng").GetDouble());
        }
    }

    /// <summary>Proxy Directions API (alternativas peatón/bici).</summary>
    public async Task<(bool Ok, JsonDocument? Doc, string? Error)> DirectionsAsync(
        double originLat,
        double originLng,
        double destLat,
        double destLng,
        string mode,
        CancellationToken ct = default)
    {
        var apiKey = GetGoogleMapsApiKey();
        if (string.IsNullOrEmpty(apiKey))
        {
            return (false, null, "Configura VITE_GOOGLE_MAPS_API_KEY en .env (raíz del proyecto).");
        }

        var travelMode = mode.Equals("bicycling", StringComparison.OrdinalIgnoreCase)
            ? "bicycling"
            : "walking";

        try
        {
            var client = _httpFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(15);
            var oLat = originLat.ToString(CultureInfo.InvariantCulture);
            var oLng = originLng.ToString(CultureInfo.InvariantCulture);
            var dLat = destLat.ToString(CultureInfo.InvariantCulture);
            var dLng = destLng.ToString(CultureInfo.InvariantCulture);
            var url =
                "https://maps.googleapis.com/maps/api/directions/json?" +
                $"origin={Uri.EscapeDataString($"{oLat},{oLng}")}" +
                $"&destination={Uri.EscapeDataString($"{dLat},{dLng}")}" +
                $"&mode={travelMode}&alternatives=true&region=pe" +
                $"&key={Uri.EscapeDataString(apiKey)}";
            var json = await client.GetStringAsync(url, ct);
            var doc = JsonDocument.Parse(json);
            var status = doc.RootElement.TryGetProperty("status", out var st)
                ? st.GetString()
                : null;
            if (status is "OK" or "ZERO_RESULTS" or "NOT_FOUND")
            {
                return (true, doc, null);
            }

            var msg = status switch
            {
                "REQUEST_DENIED" =>
                    "Google rechazó la clave para Directions. Revisa restricciones de la API key en Cloud Console.",
                "OVER_QUERY_LIMIT" => "Límite de consultas de Directions API alcanzado.",
                _ => $"Directions falló ({status ?? "desconocido"}).",
            };
            doc.Dispose();
            return (false, null, msg);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Directions API no disponible");
            return (false, null, "No se pudo contactar Directions API.");
        }
    }

    /// <summary>Clave para Geocoding/Directions en servidor (sin referrer). Front usa VITE_*.</summary>
    public bool IsGoogleMapsKeyConfigured() => GetGoogleMapsApiKey() != null;

    private string? GetGoogleMapsApiKey()
    {
        foreach (var name in new[] { "GOOGLE_MAPS_API_KEY", "VITE_GOOGLE_MAPS_API_KEY" })
        {
            var v = _config[name]?.Trim();
            if (!string.IsNullOrEmpty(v) && v.StartsWith("AIza", StringComparison.Ordinal))
            {
                return v;
            }
        }

        return null;
    }

    private static ClimaResponse DemoClima(double lat, double lon) =>
        new(
            lat,
            lon,
            22.0,
            "Lluvia ligera (demo sin WEATHERAPI_API_KEY)",
            "Demo local",
            PrecipMm: 0.8,
            VisKm: 6);
}

public record ApiInfo(string Nombre, string Proposito, string Config, string UsoEnProyecto);

public record ApiCatalogResponse(IReadOnlyList<ApiInfo> Apis);

public record ClimaResponse(
    double Lat,
    double Lon,
    double TemperaturaC,
    string Descripcion,
    string Fuente,
    double PrecipMm = 0,
    double VisKm = 10);

public record TraficoDemoResponse(string Zona, string Nivel, float FactorNormalizado, string Fuente);
