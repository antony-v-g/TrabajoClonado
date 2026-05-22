using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Services;

namespace RutaSegura.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class DashboardController : ControllerBase
{
    private readonly ApplicationDbContext _db;
    private readonly RedisService _redis;

    public DashboardController(ApplicationDbContext db, RedisService redis)
    {
        _db = db;
        _redis = redis;
    }

    private int GetUserId() =>
        int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);

    /// <summary>Lugares frecuentes del usuario (historial de rutas en SQLite, caché Redis).</summary>
    [HttpGet("lugares-frecuentes")]
    public async Task<IActionResult> GetLugaresFrecuentes(CancellationToken ct = default)
    {
        var userId = GetUserId();
        var cacheKey = DashboardCacheKeys.Lugares(userId);

        if (_redis.IsEnabled)
        {
            var cached = await _redis.GetStringAsync(cacheKey);
            if (cached != null)
            {
                var parsed = ApiJson.Deserialize<LugaresFrecuentesResponse>(cached);
                if (parsed != null)
                    return Ok(parsed with { ServidoDesdeCache = true });
            }
        }

        var historial = await _db.RutasHistorial
            .AsNoTracking()
            .Where(r => r.UsuarioId == userId)
            .OrderByDescending(r => r.CreadoEn)
            .Take(80)
            .ToListAsync(ct);

        var agrupados = historial
            .GroupBy(h => h.DestinoTexto.Trim())
            .Select(g => new LugarFrecuenteDto(
                g.Key,
                IconoParaDestino(g.Key),
                (int)Math.Round(g.Average(x => x.MinutosAprox)),
                g.Count()))
            .OrderByDescending(x => x.Usos)
            .Take(4)
            .ToList();

        if (agrupados.Count == 0)
        {
            var guardadas = await _db.UbicacionesGuardadas
                .AsNoTracking()
                .Where(u => u.UsuarioId == userId)
                .OrderBy(u => u.Orden)
                .Take(4)
                .ToListAsync(ct);

            agrupados = guardadas
                .Select(u =>
                    new LugarFrecuenteDto(
                        u.Etiqueta,
                        string.IsNullOrWhiteSpace(u.Icono)
                            ? IconoParaDestino(u.Etiqueta)
                            : u.Icono!,
                        0,
                        0))
                .ToList();
        }

        var response = new LugaresFrecuentesResponse(
            agrupados,
            agrupados.Count,
            _redis.IsEnabled,
            false,
            DateTime.UtcNow);

        if (_redis.IsEnabled)
        {
            await _redis.SetStringAsync(
                cacheKey,
                ApiJson.Serialize(response),
                TimeSpan.FromMinutes(5));
        }

        return Ok(response);
    }

    private static string IconoParaDestino(string destino)
    {
        var d = destino.ToLowerInvariant();
        if (d.Contains("casa") || d.Contains("hogar")) return "🏠";
        if (d.Contains("univ") || d.Contains("campus") || d.Contains("facultad")) return "🎓";
        if (d.Contains("trabajo") || d.Contains("oficina")) return "💼";
        if (d.Contains("paradero") || d.Contains("metro") || d.Contains("estación"))
            return "🚏";
        return "📍";
    }
}

public record LugarFrecuenteDto(
    string Nombre,
    string Icono,
    int MinutosAprox,
    int Usos);

public record LugaresFrecuentesResponse(
    IReadOnlyList<LugarFrecuenteDto> Lugares,
    int Total,
    bool CacheRedisActivo,
    bool ServidoDesdeCache,
    DateTime GeneradoEnUtc);

public static class DashboardCacheKeys
{
    public static string Lugares(int userId) => $"dashboard:lugares:v1:{userId}";
}
