using System.ComponentModel.DataAnnotations;
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
    public class ReportesController : ControllerBase
    {
        private const int MaxEvidenciaLength = 1_200_000;
        private readonly ApplicationDbContext _context;
        private readonly RedisService _redis;
        private readonly MlNetService _ml;
        private readonly AlertasInteligentesService _alertasInteligentes;
        private readonly ReporteGeocodingService _geocoding;
        private readonly ILogger<ReportesController> _logger;

        public ReportesController(
            ApplicationDbContext context,
            RedisService redis,
            MlNetService ml,
            AlertasInteligentesService alertasInteligentes,
            ReporteGeocodingService geocoding,
            ILogger<ReportesController> logger)
        {
            _context = context;
            _redis = redis;
            _ml = ml;
            _alertasInteligentes = alertasInteligentes;
            _geocoding = geocoding;
            _logger = logger;
        }

        private static string? CodigoCatalogoDesdeTipo(string tipoIncidente)
        {
            return tipoIncidente.Trim() switch
            {
                "Robo" => "Robo",
                "Acoso" => "Asalto",
                "Sin Iluminación" => "ZonaOscura",
                "Hueco en Vía" => "Accidente",
                "Accidente" => "Accidente",
                "Vandalismo" => "Vandalismo",
                "Otro peligro" => "Otro",
                _ => null,
            };
        }

        [Authorize(Roles = "Administrador")]
        [HttpGet]
        public async Task<IActionResult> GetReportes()
        {
            var cacheKey = "reportes:todos:v3";

            if (_redis.IsEnabled)
            {
                var cache = await _redis.GetStringAsync(cacheKey);
                if (cache != null)
                {
                    var cached = ApiJson.Deserialize<object>(cache);
                    if (cached != null)
                        return Ok(cached);
                }
            }

            var reportes = await _context.Reportes
                .AsNoTracking()
                .OrderByDescending(r => r.FechaReporte)
                .Select(r => new
                {
                    r.Id,
                    r.TipoIncidente,
                    r.Ubicacion,
                    r.Descripcion,
                    r.Estado,
                    r.FechaReporte,
                    r.NivelConfianzaIA,
                    r.TipoPredichoMl,
                    r.Latitud,
                    r.Longitud,
                    r.EsAnonimo,
                    Usuario = r.Usuario == null
                        ? null
                        : new { r.Usuario.Nombre, r.Usuario.Email },
                })
                .ToListAsync();

            if (_redis.IsEnabled)
            {
                await _redis.SetStringAsync(
                    cacheKey,
                    ApiJson.Serialize(reportes),
                    TimeSpan.FromMinutes(5)
                );
            }

            return Ok(reportes);
        }

        [AllowAnonymous]
        [HttpGet("recientes")]
        public async Task<IActionResult> GetRecientes(
            [FromQuery] int take = 8,
            [FromQuery] int maxDays = 30)
        {
            var n = Math.Clamp(take, 1, 30);
            var days = Math.Clamp(maxDays, 1, 365);
            var cacheKey = $"reportes:recientes:v3:{n}:{days}";

            if (_redis.IsEnabled)
            {
                var cache = await _redis.GetStringAsync(cacheKey);
                if (cache != null)
                {
                    var cached = ApiJson.Deserialize<object>(cache);
                    if (cached != null)
                        return Ok(cached);
                }
            }

            var from = DateTime.UtcNow.AddDays(-days);

            var list = await _context.Reportes
                .AsNoTracking()
                .Where(r =>
                    r.FechaReporte >= from &&
                    r.Estado != "Rechazado")
                .OrderByDescending(r => r.FechaReporte)
                .Take(n)
                .Select(r => new
                {
                    r.Id,
                    TipoIncidente = r.TipoIncidente ?? "Otro",
                    Ubicacion = r.Ubicacion ?? "Ubicación desconocida",
                    r.Descripcion,
                    r.FechaReporte,
                })
                .ToListAsync();

            if (_redis.IsEnabled)
            {
                await _redis.SetStringAsync(
                    cacheKey,
                    ApiJson.Serialize(list),
                    TimeSpan.FromMinutes(5)
                );
            }

            return Ok(list);
        }

        [Authorize]
        [HttpGet("mios")]
        public async Task<IActionResult> GetMios()
        {
            var id = int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
            var cacheKey = $"reportes:mios:{id}";

            if (_redis.IsEnabled)
            {
                var cache = await _redis.GetStringAsync(cacheKey);
                if (cache != null)
                {
                    var cached = ApiJson.Deserialize<object>(cache);
                    if (cached != null)
                        return Ok(cached);
                }
            }

            var reportes = await _context.Reportes
                .Where(r => r.UsuarioId == id)
                .OrderByDescending(r => r.FechaReporte)
                .Select(r => new
                {
                    r.Id,
                    r.TipoIncidente,
                    r.Ubicacion,
                    r.Estado,
                    r.FechaReporte,
                    r.EsAnonimo,
                    r.Descripcion,
                })
                .ToListAsync();

            if (_redis.IsEnabled)
            {
                await _redis.SetStringAsync(
                    cacheKey,
                    ApiJson.Serialize(reportes),
                    TimeSpan.FromMinutes(5)
                );
            }

            return Ok(reportes);
        }

        [Authorize(Roles = "Administrador")]
        [HttpPost("Aprobar/{id}")]
        public async Task<IActionResult> Aprobar(int id, CancellationToken ct)
        {
            var reporte = await _context.Reportes.FindAsync([id], ct);
            if (reporte == null) return NotFound();

            reporte.Estado = "Aprobado";
            await _geocoding.EnsureCoordinatesAsync(reporte, ct);
            await _context.SaveChangesAsync(ct);

            await LimpiarCacheReportes(reporte.UsuarioId);

            return Ok(
                new
                {
                    success = true,
                    message = "Reporte aprobado correctamente.",
                    tieneCoordenadas = ReporteGeocodingService.TieneCoordenadas(reporte),
                });
        }

        [Authorize(Roles = "Administrador")]
        [HttpPost("Rechazar/{id}")]
        public async Task<IActionResult> Rechazar(int id, CancellationToken ct)
        {
            var reporte = await _context.Reportes.FindAsync([id], ct);
            if (reporte == null) return NotFound();

            reporte.Estado = "Rechazado";
            await _geocoding.EnsureCoordinatesAsync(reporte, ct);
            await _context.SaveChangesAsync(ct);

            await LimpiarCacheReportes(reporte.UsuarioId);

            return Ok(
                new
                {
                    success = true,
                    message = "Reporte rechazado.",
                    tieneCoordenadas = ReporteGeocodingService.TieneCoordenadas(reporte),
                });
        }

        public class CrearReporteRequest
        {
            [Required]
            public string TipoIncidente { get; set; } = string.Empty;

            [Required]
            public string Ubicacion { get; set; } = string.Empty;

            public string? Descripcion { get; set; }
            public string? Latitud { get; set; }
            public string? Longitud { get; set; }
            public string? UrlFotoEvidencia { get; set; }
            public bool EsAnonimo { get; set; }
        }

        [Authorize]
        [HttpPost("Crear")]
        public async Task<IActionResult> Crear(
            [FromBody] CrearReporteRequest req,
            CancellationToken ct)
        {
            if (!ModelState.IsValid) return BadRequest(ModelState);

            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
                return Unauthorized(new { message = "Sesión inválida. Inicia sesión de nuevo." });

            if (!await _context.Usuarios.AsNoTracking().AnyAsync(u => u.Id == userId))
            {
                return Unauthorized(new
                {
                    message =
                        "Tu usuario ya no existe en el servidor (p. ej. tras un reinicio). Cierra sesión e inicia de nuevo.",
                });
            }

            if (!string.IsNullOrEmpty(req.UrlFotoEvidencia) &&
                req.UrlFotoEvidencia.Length > MaxEvidenciaLength)
            {
                return BadRequest(new
                {
                    message = "La evidencia (foto, PDF o Word) es demasiado grande. Reduce el tamaño del archivo."
                });
            }

            var codigoCatalogo = CodigoCatalogoDesdeTipo(req.TipoIncidente) ?? req.TipoIncidente.Trim();
            var cat = await _context.Catalogos
                .AsNoTracking()
                .FirstOrDefaultAsync(c =>
                    c.Tipo == "TipoReporte"
                    && c.Activo
                    && (c.Codigo == codigoCatalogo || c.Nombre == req.TipoIncidente));

            var proyectoDefault = await _context.Proyectos
                .AsNoTracking()
                .OrderBy(p => p.Id)
                .FirstOrDefaultAsync();

            var hasCoords =
                !string.IsNullOrWhiteSpace(req.Latitud) && !string.IsNullOrWhiteSpace(req.Longitud);

            var nivelIa = 0f;
            string? tipoPredichoMl = null;
            try
            {
                await _ml.EnsureModelsAsync();
                var clasificacion = _ml.ClassifyIncident(
                    req.Descripcion,
                    req.Ubicacion,
                    hasCoords,
                    DateTime.UtcNow);
                if (clasificacion != null)
                {
                    tipoPredichoMl = clasificacion.TipoPredicho;
                    if (clasificacion.ProbabilidadesPorTipo.TryGetValue(codigoCatalogo, out var prob))
                        nivelIa = prob * 100f;
                    else if (string.Equals(
                                 clasificacion.TipoPredicho,
                                 codigoCatalogo,
                                 StringComparison.OrdinalIgnoreCase))
                        nivelIa = (float)clasificacion.ConfianzaPct;
                    else
                        nivelIa = (float)clasificacion.ConfianzaPct;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "ML omitido al crear reporte para usuario {UserId}", userId);
            }

            var reporte = new Reporte
            {
                TipoIncidente = req.TipoIncidente,
                Ubicacion = req.Ubicacion,
                Descripcion = req.Descripcion,
                Latitud = req.Latitud,
                Longitud = req.Longitud,
                UrlFotoEvidencia = req.UrlFotoEvidencia,
                EsAnonimo = req.EsAnonimo,
                UsuarioId = userId,
                FechaReporte = DateTime.UtcNow,
                Estado = "Pendiente",
                CatalogoId = cat?.Id,
                ProyectoId = proyectoDefault?.Id,
                NivelConfianzaIA = nivelIa,
                TipoPredichoMl = tipoPredichoMl,
            };

            await _geocoding.EnsureCoordinatesAsync(reporte, ct);

            try
            {
                _context.Reportes.Add(reporte);
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException ex)
            {
                _logger.LogError(ex, "No se pudo guardar el reporte (usuario {UserId})", userId);
                return StatusCode(
                    500,
                    new
                    {
                        message =
                            "No se pudo guardar el reporte en la base de datos. Prueba sin adjuntar archivo o inicia sesión de nuevo.",
                    });
            }

            try
            {
                await LimpiarCacheReportes(userId);
                await _alertasInteligentes.EvaluarTrasReporteAsync(req.Ubicacion);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Cache Redis no limpiada tras crear reporte {ReporteId}", reporte.Id);
            }

            return Ok(new { success = true, message = "Reporte creado exitosamente.", id = reporte.Id });
        }

        private async Task LimpiarCacheReportes(int usuarioId)
        {
            if (!_redis.IsEnabled) return;

            try
            {
                await _redis.RemoveAsync("reportes:todos:v3");
                await _redis.RemoveAsync("reportes:todos:v2");
                await _redis.RemoveAsync($"reportes:mios:{usuarioId}");

                for (int take = 1; take <= 30; take++)
                {
                    await _redis.RemoveAsync($"reportes:recientes:v3:{take}:30");
                }

                await _redis.RemoveAsync("reportes:recientes:v3:8:30");
                await DashboardAlertasService.InvalidateAlertasCacheAsync(_redis);

                for (var take = 1; take <= 100; take++)
                    await _redis.RemoveAsync($"mapa:incidentes:v1:30:{take}");

                await AdminCacheKeys.InvalidateAllAsync(_redis);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error al invalidar caché tras reporte");
            }
        }
    }
}