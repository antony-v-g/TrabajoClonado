using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using RutaSegura.Data;
using RutaSegura.Models;
using RutaSegura.Services;

namespace RutaSegura.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly JwtService _jwtService;
        private readonly RedisService _redisService;

        public AuthController(ApplicationDbContext context, JwtService jwtService, RedisService redisService)
        {
            _context = context;
            _jwtService = jwtService;
            _redisService = redisService;
        }

        /// <summary>Correo de prueba: <c>algo@usuario.com</c> = rol Usuario. <c>algo@admin.com</c> = Administrador.</summary>
        private const string DomainUsuario = "usuario.com";

        private const string DomainAdmin = "admin.com";

        private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

        /// <summary>
        /// Solo acepta <c>*@usuario.com</c> (Usuario) o <c>*@admin.com</c> (Administrador).
        /// Cualquier otro dominio (Gmail, etc.) se rechaza: es la convención del demo/proyecto.
        /// </summary>
        private static bool TryResolveRolByEmail(string emailNormalized, out string rol, out string? error)
        {
            error = null;
            rol = "Usuario";
            var at = emailNormalized.LastIndexOf('@');
            if (at < 1 || at == emailNormalized.Length - 1)
            {
                error = "El correo no es válido.";
                return false;
            }

            var domain = emailNormalized[(at + 1)..];
            if (domain == DomainAdmin)
            {
                rol = "Administrador";
                return true;
            }

            if (domain == DomainUsuario)
            {
                rol = "Usuario";
                return true;
            }

            error = "Solo se permiten correos que terminen en @usuario.com (cuenta de usuario) o @admin.com (administrador). Por ejemplo: lucia@usuario.com o maria@admin.com.";
            return false;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var emailLogin = NormalizeEmail(request.Email);
            if (!TryResolveRolByEmail(emailLogin, out _, out var loginDomainError))
            {
                return BadRequest(new { message = loginDomainError });
            }

            var usuario = await _context.Usuarios
                .FirstOrDefaultAsync(u => u.Email.ToLower() == emailLogin);
            if (usuario == null || !PasswordService.Verify(usuario.PasswordHash, request.Password))
            {
                return Unauthorized(new { message = "Correo o contraseña incorrectos." });
            }

            try
            {
                var (token, jti, expiraEn) = _jwtService.GenerateToken(usuario);
                var userAgent = Request.Headers.UserAgent.ToString();
                if (userAgent.Length > 500)
                {
                    userAgent = userAgent.Substring(0, 500);
                }

                var sesion = new Sesion
                {
                    UsuarioId = usuario.Id,
                    TokenJti = jti,
                    IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
                    UserAgent = string.IsNullOrEmpty(userAgent) ? null : userAgent,
                    Origen = "web",
                    ExpiraEn = expiraEn,
                    Estado = "Activa",
                };
                _context.Sesiones.Add(sesion);
                await _context.SaveChangesAsync();

                await _redisService.SetStringAsync(
                    $"sesion:{jti}", usuario.Id.ToString(), expiraEn - DateTime.UtcNow);

                return Ok(
                    new
                    {
                        usuario.Id,
                        usuario.Nombre,
                        usuario.Email,
                        usuario.Telefono,
                        usuario.Rol,
                        usuario.Estado,
                        usuario.FechaRegistro,
                        token,
                        jti,
                        expiraEn,
                    });
            }
            catch (SqliteException ex) when (ex.SqliteErrorCode == 5)
            {
                return StatusCode(
                    StatusCodes.Status503ServiceUnavailable,
                    new
                    {
                        message = "Base de datos ocupada (p. ej. DBeaver con el .db abierto en escritura). "
                            + "Cierra otras conexiones y vuelve a intentar.",
                    });
            }
        }

        /// <summary>POST <c>/api/Auth/register</c> — Crea cuenta: <c>*@usuario.com</c> o <c>*@admin.com</c> (rol según dominio).</summary>
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequest request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var emailNorm = NormalizeEmail(request.Email);
            if (!TryResolveRolByEmail(emailNorm, out var rol, out var domainError))
            {
                return BadRequest(new { message = domainError });
            }

            var exists = await _context.Usuarios.AnyAsync(u => u.Email.ToLower() == emailNorm);
            if (exists)
            {
                return Conflict(new { message = "Ya existe un usuario con ese correo electrónico." });
            }

            var nuevoUsuario = new Usuario
            {
                Nombre = request.Nombre,
                Email = emailNorm,
                PasswordHash = PasswordService.Hash(request.Password),
                Telefono = request.Telefono,
                Rol = rol,
                Estado = "Activo",
            };

            _context.Usuarios.Add(nuevoUsuario);
            await _context.SaveChangesAsync();

            if (_redisService.IsEnabled)
                await _redisService.RemoveAsync("usuarios:todos:v2");

            var msg = rol == "Administrador"
                ? "Cuenta de administrador creada. Inicia sesión con el correo y contraseña que registraste."
                : "Cuenta creada. Cada persona puede usar su propio correo. Inicia sesión cuando quieras.";

            return Ok(new { message = msg, rol });
        }

        /// <summary>Cierra sesión: revoca en SQLite y elimina la clave en Redis.</summary>
        [Authorize]
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            var jti = User.FindFirstValue(JwtRegisteredClaimNames.Jti);
            if (string.IsNullOrEmpty(jti))
                return Ok(new { message = "Sesión cerrada." });

            var sesion = await _context.Sesiones
                .FirstOrDefaultAsync(s => s.TokenJti == jti && s.Estado == "Activa");
            if (sesion is not null)
            {
                sesion.Estado = "Revocada";
                sesion.CerradaEn = DateTime.UtcNow;
                await _context.SaveChangesAsync();
            }

            await _redisService.RemoveAsync($"sesion:{jti}");
            return Ok(new { message = "Sesión cerrada correctamente." });
        }
    }

    public class LoginRequest
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        [StringLength(11, MinimumLength = 8, ErrorMessage = "La contraseña debe tener entre 8 y 11 caracteres.")]
        public string Password { get; set; } = string.Empty;
    }

    public class RegisterRequest
    {
        [Required]
        public string Nombre { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        [StringLength(11, MinimumLength = 8, ErrorMessage = "La contraseña debe tener entre 8 y 11 caracteres.")]
        public string Password { get; set; } = string.Empty;

        public string? Telefono { get; set; }
    }
}
