using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RutaSegura.Services;

namespace RutaSegura.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MlController : ControllerBase
{
    private readonly MlNetService _ml;
    private readonly MlZoneQueryService _zonas;
    private readonly ExternalApisService _external;

    public MlController(MlNetService ml, MlZoneQueryService zonas, ExternalApisService external)
    {
        _ml = ml;
        _zonas = zonas;
        _external = external;
    }

    /// <summary>Estado de los modelos ML.NET (clasificación y recomendación).</summary>
    [HttpGet("estado")]
    [AllowAnonymous]
    public async Task<IActionResult> GetEstado(CancellationToken ct) =>
        Ok(await _ml.GetStatusAsync(ct));

    /// <summary>Clasifica el tipo de incidente a partir de contexto del reporte.</summary>
    [HttpPost("clasificar-incidente")]
    [AllowAnonymous]
    public async Task<IActionResult> ClasificarIncidente(
        [FromBody] ClasificarIncidenteRequest req,
        CancellationToken ct)
    {
        await _ml.EnsureModelsAsync(ct);
        var result = _ml.ClassifyIncident(
            req.Descripcion,
            req.Ubicacion,
            req.HasCoordinates,
            req.FechaReporte);

        if (result == null)
            return StatusCode(503, new { message = "Modelo de clasificación no disponible." });

        return Ok(result);
    }

    /// <summary>Recomienda variantes de ruta; con clima adverso prioriza la ruta segura.</summary>
    [HttpGet("recomendar-rutas")]
    [Authorize]
    public async Task<IActionResult> RecomendarRutas(
        [FromQuery] string origen,
        [FromQuery] string destino,
        [FromQuery] double? dest_lat,
        [FromQuery] double? dest_lon,
        [FromQuery] double? orig_lat,
        [FromQuery] double? orig_lon,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(origen) || string.IsNullOrWhiteSpace(destino))
            return BadRequest(new { message = "origen y destino son obligatorios." });

        await _ml.EnsureModelsAsync(ct);
        var userId = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);

        ClimaImpacto? impactoDest = null;
        ClimaImpacto? impactoOrig = null;
        var hora = ClimaImpactoAnalyzer.HoraLocalPeru();
        var advertencias = new List<string>();

        if (dest_lat.HasValue && dest_lon.HasValue)
        {
            var ctx = await _external.GetClimaContextoAsync(dest_lat.Value, dest_lon.Value, hora, ct);
            impactoDest = ctx.Impacto;
            if (impactoDest.CondicionClima >= 0.25f)
                advertencias.Add($"Destino: {ctx.Clima.Descripcion}. {impactoDest.RecomendacionRuta}");
        }

        if (orig_lat.HasValue && orig_lon.HasValue)
        {
            var ctxOrig = await _external.GetClimaContextoAsync(orig_lat.Value, orig_lon.Value, hora, ct);
            impactoOrig = ctxOrig.Impacto;
            if (impactoOrig.Lluvia || impactoOrig.Tormenta || impactoOrig.Neblina)
                advertencias.Add($"Origen: {ctxOrig.Clima.Descripcion}.");
        }

        if (impactoDest is { CondicionClima: >= 0.35f })
            advertencias.Add("☔ Ruta más segura recomendada por condiciones climáticas en el destino.");

        var items = _ml.RecommendRouteProfilesConClima(userId, origen.Trim(), destino.Trim(), impactoDest);
        var influidoPorClima = impactoDest is { CondicionClima: >= 0.25f };

        return Ok(
            new
            {
                origen,
                destino,
                motor = influidoPorClima
                    ? "ML.NET MatrixFactorization + WeatherAPI"
                    : "ML.NET MatrixFactorization",
                influidoPorClima,
                climaDestino = impactoDest,
                climaOrigen = impactoOrig,
                advertenciasClima = advertencias,
                recomendaciones = items,
            });
    }

    /// <summary>Reentrena ambos modelos con datos de la base (admin / desarrollo).</summary>
    [HttpPost("entrenar")]
    [Authorize(Roles = "Administrador")]
    public async Task<IActionResult> Entrenar(CancellationToken ct)
    {
        var result = await _ml.RetrainAsync(ct);
        return Ok(
            new
            {
                message = "Modelos ML.NET entrenados y guardados.",
                clasificacion = result.Incident,
                recomendacion = result.Recommendation,
                seguridadZona = result.ZoneSafety,
            });
    }

    /// <summary>
    /// Clasifica una zona (ML.NET — incluye CondicionClima si se envía).
    /// </summary>
    [HttpGet("clasificar-zona")]
    [AllowAnonymous]
    public async Task<IActionResult> ClasificarZonaGet(
        [FromQuery] string zona = "Lima",
        [FromQuery] float cantidad_reportes = 0.3f,
        [FromQuery] float hora = 12f,
        [FromQuery] float iluminacion = 0.6f,
        [FromQuery] float trafico = 0.4f,
        [FromQuery] float incidentes_recientes = 0f,
        [FromQuery] float condicion_clima = 0f,
        CancellationToken ct = default)
    {
        var response = await _zonas.ClasificarAsync(
            zona,
            cantidad_reportes,
            hora,
            iluminacion,
            trafico,
            incidentes_recientes,
            condicion_clima,
            ct);

        return Ok(new
        {
            response.Zona,
            riesgo = response.Riesgo,
            confianza = response.Confianza,
            response.IndicadorVisual,
            etiqueta = response.Etiqueta,
            response.Motor,
            response.ServidoDesdeCache,
        });
    }

    /// <summary>Clasifica seguridad de zona (POST JSON).</summary>
    [HttpPost("clasificar-zona")]
    [AllowAnonymous]
    public async Task<IActionResult> ClasificarZonaPost(
        [FromBody] ClasificarZonaRequest req,
        CancellationToken ct)
    {
        var response = await _zonas.ClasificarAsync(
            req.Zona ?? "Lima",
            req.CantidadReportes,
            req.Hora,
            req.Iluminacion,
            req.Trafico,
            req.IncidentesRecientes,
            req.CondicionClima,
            ct);
        return Ok(response);
    }

    /// <summary>Contexto externo + ML para una zona (WeatherAPI + clasificación + riesgo horario).</summary>
    [HttpGet("contexto-zona")]
    [AllowAnonymous]
    public async Task<IActionResult> ContextoZona(
        [FromQuery] string zona = "Centro de Lima",
        [FromQuery] double lat = -12.0464,
        [FromQuery] double lon = -77.0428,
        [FromQuery] float cantidad_reportes = 0.5f,
        [FromQuery] float iluminacion = 0.6f,
        [FromQuery] float trafico = 0.4f,
        [FromQuery] float incidentes_recientes = 1f,
        [FromQuery] float hora_local = 12f,
        CancellationToken ct = default)
    {
        var ctx = await _external.GetClimaContextoAsync(lat, lon, hora_local, ct);
        var traficoInfo = _external.GetTraficoDemo(zona);
        var traficoFactor = trafico > 0 ? trafico : traficoInfo.FactorNormalizado;
        var ilum = iluminacion > 0
            ? ClimaImpactoAnalyzer.AjustarIluminacion(iluminacion, ctx.Impacto)
            : ClimaImpactoAnalyzer.IluminacionPorDefecto(ctx.Clima, ctx.Impacto);

        var ml = await _zonas.ClasificarAsync(
            zona,
            cantidad_reportes,
            hora_local,
            ilum,
            traficoFactor,
            incidentes_recientes,
            ctx.Impacto.CondicionClima,
            ct);

        var riesgoHorario = await BuildRiesgoHorarioAsync(
            zona,
            cantidad_reportes,
            ilum,
            traficoFactor,
            incidentes_recientes,
            ctx.Impacto.CondicionClima,
            hora_local,
            ct);

        return Ok(new
        {
            zona,
            lat,
            lon,
            clima = ctx.Clima,
            climaImpacto = ctx.Impacto,
            trafico = traficoInfo,
            clasificacion = ml,
            riesgoHorario,
        });
    }

    /// <summary>Comparación ML de riesgo por franja horaria (tarde / noche / ahora).</summary>
    [HttpGet("riesgo-horario")]
    [AllowAnonymous]
    public async Task<IActionResult> RiesgoHorario(
        [FromQuery] string zona = "Lima",
        [FromQuery] float cantidad_reportes = 0.5f,
        [FromQuery] float iluminacion = 0.6f,
        [FromQuery] float trafico = 0.4f,
        [FromQuery] float incidentes_recientes = 1f,
        [FromQuery] float condicion_clima = 0f,
        [FromQuery] float hora_local = 12f,
        CancellationToken ct = default)
    {
        var franjas = await BuildRiesgoHorarioAsync(
            zona,
            cantidad_reportes,
            iluminacion,
            trafico,
            incidentes_recientes,
            condicion_clima,
            hora_local,
            ct);
        return Ok(new { zona, franjas });
    }

    private async Task<IReadOnlyList<RiesgoFranjaDto>> BuildRiesgoHorarioAsync(
        string zona,
        float cantidadReportes,
        float iluminacion,
        float trafico,
        float incidentesRecientes,
        float condicionClima,
        float horaLocal,
        CancellationToken ct)
    {
        var slots = new (float Hora, string Franja)[]
        {
            (14f, "14:00 · tarde"),
            (20f, "20:00 · noche"),
            (horaLocal, "Ahora"),
        };

        var result = new List<RiesgoFranjaDto>();
        foreach (var (hora, franja) in slots)
        {
            var ml = await _zonas.ClasificarAsync(
                zona,
                cantidadReportes,
                hora,
                iluminacion,
                trafico,
                incidentesRecientes,
                condicionClima,
                ct);
            result.Add(new RiesgoFranjaDto(
                franja,
                hora,
                ml.Riesgo,
                ml.Confianza,
                ml.IndicadorVisual,
                ml.Etiqueta));
        }

        return result;
    }

    public record RiesgoFranjaDto(
        string Franja,
        float Hora,
        string Riesgo,
        double Confianza,
        string IndicadorVisual,
        string Etiqueta);

    public class ClasificarZonaRequest
    {
        public string? Zona { get; set; }
        public float CantidadReportes { get; set; }
        public float Trafico { get; set; }
        public float Iluminacion { get; set; }
        public float Hora { get; set; } = 12f;
        public float IncidentesRecientes { get; set; }
        public float CondicionClima { get; set; }
    }

    public class ClasificarIncidenteRequest
    {
        public string? Descripcion { get; set; }
        public string? Ubicacion { get; set; }
        public bool HasCoordinates { get; set; }
        public DateTime? FechaReporte { get; set; }
    }
}
