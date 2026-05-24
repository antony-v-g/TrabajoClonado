using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;
using RutaSegura.Services;

namespace RutaSegura.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UbicacionesController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly RedisService _redis;
        private readonly ILogger<UbicacionesController> _logger;

        public UbicacionesController(
            ApplicationDbContext context,
            RedisService redis,
            ILogger<UbicacionesController> logger)
        {
            _context = context;
            _redis = redis;
            _logger = logger;
        }

        private bool TryGetUserId(out int userId)
        {
            userId = 0;
            var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return !string.IsNullOrEmpty(claim) && int.TryParse(claim, out userId);
        }

        private async Task<IActionResult?> RechazarSiUsuarioNoExiste(int userId)
        {
            if (await _context.Usuarios.AsNoTracking().AnyAsync(u => u.Id == userId))
                return null;

            return Unauthorized(new
            {
                message =
                    "Tu usuario ya no existe en el servidor (p. ej. tras un reinicio). Cierra sesión e inicia de nuevo.",
            });
        }

        [HttpGet("mias")]
        public async Task<IActionResult> GetMias()
        {
            if (!TryGetUserId(out var id))
                return Unauthorized(new { message = "Sesión inválida. Inicia sesión de nuevo." });
            var list = await _context.UbicacionesGuardadas
                .Where(u => u.UsuarioId == id)
                .OrderBy(u => u.Orden)
                .ThenBy(u => u.Etiqueta)
                .ToListAsync();
            return Ok(list);
        }

        [HttpPost("mias")]
        public async Task<IActionResult> Crear([FromBody] UbicacionSolicitud body)
        {
            if (!TryGetUserId(out var userId))
                return Unauthorized(new { message = "Sesión inválida. Inicia sesión de nuevo." });

            var rechazo = await RechazarSiUsuarioNoExiste(userId);
            if (rechazo is not null) return rechazo;

            if (string.IsNullOrWhiteSpace(body.Etiqueta) || string.IsNullOrWhiteSpace(body.Direccion))
            {
                return BadRequest(new { message = "Nombre y dirección son obligatorios." });
            }

            var icono = body.Icono?.Trim();
            if (!string.IsNullOrEmpty(icono) && icono.Length > 20)
                icono = icono[..20];

            var item = new UbicacionGuardada
            {
                UsuarioId = userId,
                Etiqueta = body.Etiqueta.Trim(),
                Direccion = body.Direccion.Trim(),
                Latitud = body.Latitud,
                Longitud = body.Longitud,
                Icono = icono,
                Orden = body.Orden,
                CreadoEn = DateTime.UtcNow,
            };

            try
            {
                _context.UbicacionesGuardadas.Add(item);
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "No se pudo crear ubicación para usuario {UserId}", userId);
                return StatusCode(500, new { message = "No se pudo guardar la ubicación. Inicia sesión de nuevo." });
            }

            await DashboardCacheKeys.InvalidateLugaresAsync(_redis, userId);
            return StatusCode(StatusCodes.Status201Created, item);
        }

        [HttpPut("mias/{id:int}")]
        public async Task<IActionResult> Actualizar(int id, [FromBody] UbicacionSolicitud body)
        {
            if (!TryGetUserId(out var userId))
                return Unauthorized(new { message = "Sesión inválida. Inicia sesión de nuevo." });
            var item = await _context.UbicacionesGuardadas
                .FirstOrDefaultAsync(u => u.Id == id && u.UsuarioId == userId);
            if (item is null) return NotFound();

            var icono = body.Icono?.Trim();
            if (!string.IsNullOrEmpty(icono) && icono.Length > 20)
                icono = icono[..20];

            item.Etiqueta = body.Etiqueta.Trim();
            item.Direccion = body.Direccion.Trim();
            item.Latitud = body.Latitud;
            item.Longitud = body.Longitud;
            item.Icono = icono;
            item.Orden = body.Orden;
            await _context.SaveChangesAsync();
            await DashboardCacheKeys.InvalidateLugaresAsync(_redis, userId);
            return Ok(item);
        }

        [HttpDelete("mias/{id:int}")]
        public async Task<IActionResult> Eliminar(int id)
        {
            if (!TryGetUserId(out var userId))
                return Unauthorized(new { message = "Sesión inválida. Inicia sesión de nuevo." });
            var item = await _context.UbicacionesGuardadas
                .FirstOrDefaultAsync(u => u.Id == id && u.UsuarioId == userId);
            if (item is null) return NotFound();
            _context.UbicacionesGuardadas.Remove(item);
            await _context.SaveChangesAsync();
            await DashboardCacheKeys.InvalidateLugaresAsync(_redis, userId);
            return NoContent();
        }

        public class UbicacionSolicitud
        {
            public string Etiqueta { get; set; } = string.Empty;
            public string Direccion { get; set; } = string.Empty;
            public string? Latitud { get; set; }
            public string? Longitud { get; set; }
            public string? Icono { get; set; }
            public int Orden { get; set; }
        }
    }
}
