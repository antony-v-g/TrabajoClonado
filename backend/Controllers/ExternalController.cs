using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RutaSegura.Services;

namespace RutaSegura.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExternalController : ControllerBase
{
    private readonly ExternalApisService _external;

    public ExternalController(ExternalApisService external) => _external = external;

    /// <summary>Catálogo de APIs externas integradas o documentadas.</summary>
    [HttpGet("catalogo")]
    public IActionResult Catalogo() => Ok(_external.GetCatalog());

    /// <summary>Clima actual (WeatherAPI o demo).</summary>
    [HttpGet("clima")]
    [AllowAnonymous]
    public async Task<IActionResult> Clima(
        [FromQuery] double lat = -12.0464,
        [FromQuery] double lon = -77.0428,
        CancellationToken ct = default) =>
        Ok(await _external.GetClimaAsync(lat, lon, ct));

    /// <summary>Clima + impacto en movilidad/seguridad (Inicio, Mapa, Rutas).</summary>
    [HttpGet("clima-contexto")]
    [AllowAnonymous]
    public async Task<IActionResult> ClimaContexto(
        [FromQuery] double lat = -12.0464,
        [FromQuery] double lon = -77.0428,
        CancellationToken ct = default) =>
        Ok(await _external.GetClimaContextoAsync(lat, lon, null, ct));

    /// <summary>Resumen climático para dashboard Inicio (Lima por defecto).</summary>
    [HttpGet("resumen-inicio")]
    [AllowAnonymous]
    public async Task<IActionResult> ResumenInicio(CancellationToken ct = default)
    {
        const double lat = -12.0464;
        const double lon = -77.0428;
        var ctx = await _external.GetClimaContextoAsync(lat, lon, null, ct);
        return Ok(new
        {
            ciudad = "Lima",
            clima = ctx.Clima,
            impacto = ctx.Impacto,
            horaLocal = ctx.HoraLocal,
            titulo = $"{ctx.Impacto.Emoji} {ctx.Clima.Descripcion} en Lima",
            subtitulo = ctx.Impacto.RiesgoMovilidad == "Alto"
                ? "⚠️ Riesgo alto de movilidad"
                : ctx.Impacto.RiesgoMovilidad == "Moderado"
                    ? "⚠️ Riesgo moderado de movilidad"
                    : "Movilidad favorable",
        });
    }

    /// <summary>Tráfico estimado demo para enriquecer variables ML.</summary>
    [HttpGet("trafico-demo")]
    public IActionResult TraficoDemo([FromQuery] string zona = "Lima") =>
        Ok(_external.GetTraficoDemo(zona));

    /// <summary>Comprueba que el backend ve la clave de Maps (sin exponerla).</summary>
    [HttpGet("ping-maps")]
    [AllowAnonymous]
    public IActionResult PingMaps() =>
        Ok(new
        {
            geocodeKeyConfigured = _external.IsGoogleMapsKeyConfigured(),
            mensaje = _external.IsGoogleMapsKeyConfigured()
                ? "Backend listo para geocode/directions."
                : "Falta GOOGLE_MAPS_API_KEY o VITE_GOOGLE_MAPS_API_KEY en .env",
        });

    /// <summary>Geocodificación vía backend (sin CORS ni Geocoder JS).</summary>
    [HttpGet("geocode")]
    [AllowAnonymous]
    public async Task<IActionResult> Geocode(
        [FromQuery] string address,
        CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            return BadRequest(new { message = "Parámetro address requerido." });
        }

        var (ok, doc, err) = await _external.GeocodeAsync(address.Trim(), ct);
        if (!ok || doc is null)
        {
            return StatusCode(502, new { message = err ?? "Error de geocodificación." });
        }

        using (doc)
        {
            return Content(doc.RootElement.GetRawText(), "application/json");
        }
    }

    /// <summary>Directions vía backend (alternativas peatón/bici).</summary>
    [HttpGet("directions")]
    [AllowAnonymous]
    public async Task<IActionResult> Directions(
        [FromQuery] double originLat,
        [FromQuery] double originLng,
        [FromQuery] double destLat,
        [FromQuery] double destLng,
        [FromQuery] string mode = "walking",
        CancellationToken ct = default)
    {
        var (ok, doc, err) = await _external.DirectionsAsync(
            originLat,
            originLng,
            destLat,
            destLng,
            mode,
            ct);
        if (!ok || doc is null)
        {
            return StatusCode(502, new { message = err ?? "Error de directions." });
        }

        using (doc)
        {
            return Content(doc.RootElement.GetRawText(), "application/json");
        }
    }
}
