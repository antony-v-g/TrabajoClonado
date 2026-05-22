using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RutaSegura.Services;

namespace RutaSegura.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AlertasController : ControllerBase
{
    private readonly DashboardAlertasService _alertas;

    public AlertasController(DashboardAlertasService alertas) => _alertas = alertas;

    /// <summary>
    /// Alertas recientes para el dashboard (SQLite + Redis + clasificación ML.NET de zona).
    /// </summary>
    [HttpGet("recientes")]
    [AllowAnonymous]
    public async Task<IActionResult> GetRecientes(
        [FromQuery] int take = 8,
        [FromQuery] int maxDays = 30,
        CancellationToken ct = default)
    {
        var result = await _alertas.GetRecientesAsync(take, maxDays, ct);
        return Ok(result);
    }
}
