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
    [Authorize]
    public class RutasHistorialController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly RedisService _redis;
        private const int MaxList = 80;

        public RutasHistorialController(ApplicationDbContext context, RedisService redis)
        {
            _context = context;
            _redis = redis;
        }

        private int GetUserId()
        {
            var s = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.Parse(s!);
        }

        [HttpGet("mias")]
        public async Task<IActionResult> GetMias()
        {
            var id = GetUserId();
            var list = await _context.RutasHistorial
                .Where(r => r.UsuarioId == id)
                .OrderByDescending(r => r.CreadoEn)
                .Take(MaxList)
                .Select(r => new
                {
                    r.Id,
                    r.OrigenTexto,
                    r.DestinoTexto,
                    r.Modo,
                    r.MinutosAprox,
                    r.KmAprox,
                    r.RutaReferencia,
                    CreadoEn = r.CreadoEn,
                })
                .ToListAsync();
            return Ok(list);
        }

        public class CrearRutaHistorialDto
        {
            [Required, MaxLength(200)]
            public string OrigenTexto { get; set; } = string.Empty;
            [Required, MaxLength(500)]
            public string DestinoTexto { get; set; } = string.Empty;
            [Required, MaxLength(20)]
            public string Modo { get; set; } = "peaton";
            [Range(0, 24 * 60)]
            public int MinutosAprox { get; set; }
            [Range(0, 5000)]
            public double KmAprox { get; set; }
            [MaxLength(120)]
            public string? RutaReferencia { get; set; }
        }

        [HttpPost("mias")]
        public async Task<IActionResult> Crear([FromBody] CrearRutaHistorialDto dto)
        {
            var id = GetUserId();
            var m = (dto.Modo ?? "peaton").ToLowerInvariant();
            if (m is not "peaton" and not "bike")
                return BadRequest(new { message = "Modo inválido (use peaton o bike)." });

            var r = new RutaHistorial
            {
                UsuarioId = id,
                OrigenTexto = dto.OrigenTexto.Trim(),
                DestinoTexto = dto.DestinoTexto.Trim(),
                Modo = m,
                MinutosAprox = dto.MinutosAprox,
                KmAprox = Math.Round(dto.KmAprox, 2),
                RutaReferencia = string.IsNullOrWhiteSpace(dto.RutaReferencia) ? null : dto.RutaReferencia.Trim(),
                CreadoEn = DateTime.UtcNow,
            };
            _context.RutasHistorial.Add(r);
            await _context.SaveChangesAsync();
            await DashboardCacheKeys.InvalidateLugaresAsync(_redis, id);
            return Ok(new
            {
                r.Id,
                r.OrigenTexto,
                r.DestinoTexto,
                r.Modo,
                r.MinutosAprox,
                r.KmAprox,
                r.RutaReferencia,
                CreadoEn = r.CreadoEn,
            });
        }

        [HttpDelete("mias/{id:int}")]
        public async Task<IActionResult> Eliminar(int id)
        {
            var userId = GetUserId();
            var r = await _context.RutasHistorial
                .FirstOrDefaultAsync(x => x.Id == id && x.UsuarioId == userId);
            if (r is null) return NotFound();
            _context.RutasHistorial.Remove(r);
            await _context.SaveChangesAsync();
            await DashboardCacheKeys.InvalidateLugaresAsync(_redis, userId);
            return NoContent();
        }
    }
}
