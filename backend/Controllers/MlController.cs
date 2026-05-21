using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RutaSegura.Services;

namespace RutaSegura.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MlController : ControllerBase
{
    private readonly MlNetService _ml;

    public MlController(MlNetService ml) => _ml = ml;

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

    /// <summary>Recomienda variantes de ruta (segura / rápida / equilibrada) con Matrix Factorization.</summary>
    [HttpGet("recomendar-rutas")]
    [Authorize]
    public async Task<IActionResult> RecomendarRutas(
        [FromQuery] string origen,
        [FromQuery] string destino,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(origen) || string.IsNullOrWhiteSpace(destino))
            return BadRequest(new { message = "origen y destino son obligatorios." });

        await _ml.EnsureModelsAsync(ct);
        var userId = int.Parse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)!.Value);
        var items = _ml.RecommendRouteProfiles(userId, origen.Trim(), destino.Trim());

        return Ok(
            new
            {
                origen,
                destino,
                motor = "ML.NET MatrixFactorization",
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
            });
    }

    public class ClasificarIncidenteRequest
    {
        public string? Descripcion { get; set; }
        public string? Ubicacion { get; set; }
        public bool HasCoordinates { get; set; }
        public DateTime? FechaReporte { get; set; }
    }
}
