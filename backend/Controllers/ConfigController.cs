using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RutaSegura.Services;

namespace RutaSegura.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ConfigController : ControllerBase
{
    private readonly SistemaConfigService _config;

    public ConfigController(SistemaConfigService config) => _config = config;

    /// <summary>Reglas operativas visibles para la app (peso zonas oscuras, caducidad reportes menores).</summary>
    [HttpGet("reglas-sistema")]
    [AllowAnonymous]
    public async Task<IActionResult> GetReglasSistema(CancellationToken ct)
    {
        var cfg = await _config.GetAsync(ct);
        return Ok(
            new
            {
                cfg.PesoZonasOscurasPct,
                cfg.CaducidadReporteMenorHoras,
                mensajePeso =
                    "A mayor porcentaje, las zonas oscuras y rutas nocturnas priorizan más la ruta segura.",
                mensajeCaducidad =
                    $"Los reportes de menos de {cfg.CaducidadReporteMenorHoras} h se marcan como recientes (menor peso en mapa e inicio).",
            });
    }
}
