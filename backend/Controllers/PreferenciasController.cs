using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RutaSegura.Services;

namespace RutaSegura.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PreferenciasController : ControllerBase
{
    private readonly UsuarioPreferenciasService _prefs;

    public PreferenciasController(UsuarioPreferenciasService prefs) => _prefs = prefs;

    private int GetUserId() =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    [HttpGet("mias")]
    public async Task<IActionResult> GetMias(CancellationToken ct) =>
        Ok(await _prefs.GetOrCreateAsync(GetUserId(), ct));

    [HttpPut("mias")]
    public async Task<IActionResult> Guardar(
        [FromBody] ActualizarPreferenciasRequest body,
        CancellationToken ct) =>
        Ok(await _prefs.GuardarAsync(GetUserId(), body, ct));

    /// <summary>Se llama si el usuario abandona la navegación sin marcar Llegué bien.</summary>
    [HttpPost("aviso-sin-llegada")]
    public async Task<IActionResult> AvisoSinLlegada(
        [FromBody] AvisoSinLlegadaRequest? body,
        CancellationToken ct)
    {
        var result = await _prefs.RegistrarAvisoSinLlegadaAsync(
            GetUserId(),
            body?.Destino,
            ct);

        if (result is null)
            return Ok(new { registrado = false, mensaje = "Aviso automático desactivado en tu configuración." });

        return Ok(
            new
            {
                registrado = true,
                result.Mensaje,
                result.Contactos,
                result.AlertaSistemaId,
                result.CacheRedisActivo,
            });
    }
}

public record AvisoSinLlegadaRequest(string? Destino);
