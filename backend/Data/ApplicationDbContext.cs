using Microsoft.EntityFrameworkCore;
using RutaSegura.Models;
using RutaSegura.Services;

namespace RutaSegura.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
            : base(options)
        {
        }

        public DbSet<Reporte> Reportes { get; set; }
        public DbSet<Usuario> Usuarios { get; set; }
        public DbSet<Contacto> Contactos { get; set; }
        public DbSet<Catalogo> Catalogos { get; set; }
        public DbSet<Sesion> Sesiones { get; set; }
        public DbSet<Proyecto> Proyectos { get; set; }
        public DbSet<UbicacionGuardada> UbicacionesGuardadas { get; set; }
        public DbSet<RutaHistorial> RutasHistorial { get; set; }
        public DbSet<ConfiguracionSistema> ConfiguracionSistema { get; set; }
        public DbSet<AlertaSistema> AlertasSistema { get; set; }
        public DbSet<UsuarioPreferencias> UsuarioPreferencias { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<Usuario>()
                .HasIndex(u => u.Email)
                .IsUnique();

            modelBuilder.Entity<Catalogo>()
                .HasIndex(c => new { c.Tipo, c.Codigo })
                .IsUnique();

            modelBuilder.Entity<Contacto>()
                .HasOne(c => c.Usuario)
                .WithMany(u => u.Contactos)
                .HasForeignKey(c => c.UsuarioId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Reporte>()
                .HasOne(r => r.Usuario)
                .WithMany(u => u.Reportes)
                .HasForeignKey(r => r.UsuarioId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Reporte>()
                .HasOne(r => r.Catalogo)
                .WithMany(c => c.Reportes)
                .HasForeignKey(r => r.CatalogoId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Reporte>()
                .HasOne(r => r.Proyecto)
                .WithMany(p => p.Reportes)
                .HasForeignKey(r => r.ProyectoId)
                .OnDelete(DeleteBehavior.SetNull);

            modelBuilder.Entity<Sesion>()
                .HasOne(s => s.Usuario)
                .WithMany(u => u.Sesiones)
                .HasForeignKey(s => s.UsuarioId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Sesion>()
                .HasIndex(s => s.TokenJti)
                .IsUnique();

            modelBuilder.Entity<UbicacionGuardada>()
                .HasOne(u => u.Usuario)
                .WithMany(u => u.UbicacionesGuardadas)
                .HasForeignKey(u => u.UsuarioId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<RutaHistorial>()
                .HasOne(r => r.Usuario)
                .WithMany(u => u.RutasHistorial)
                .HasForeignKey(r => r.UsuarioId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<RutaHistorial>()
                .HasIndex(r => new { r.UsuarioId, r.CreadoEn });

            modelBuilder.Entity<UsuarioPreferencias>(e =>
            {
                e.ToTable("UsuarioPreferencias");
                e.HasKey(p => p.UsuarioId);
                e.HasOne(p => p.Usuario)
                    .WithOne()
                    .HasForeignKey<UsuarioPreferencias>(p => p.UsuarioId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ConfiguracionSistema>(e => e.ToTable("ConfiguracionSistema"));
            modelBuilder.Entity<ConfiguracionSistema>().HasData(
                new ConfiguracionSistema
                {
                    Id = 1,
                    PesoZonasOscurasPct = 40,
                    CaducidadReporteMenorHoras = 24,
                    AutoAprobarConfianzaMinPct = 85,
                    UmbralRiesgoAlertaAltaPct = 80,
                    UmbralRiesgoAlertaMediaPct = 50,
                    PushNotificacionUrl = "https://push.rutasegura.net",
                });

            modelBuilder.Entity<AlertaSistema>(e => e.ToTable("AlertasSistema"));
        }

        public async Task SeedDataAsync()
        {
            if (!Catalogos.Any())
            {
                var catalogos = new[]
                {
                    new Catalogo { Tipo = "TipoReporte", Codigo = "Robo", Nombre = "Robo", Descripcion = "Robo de vehículo o pertenencias", Activo = true, CreadoEn = DateTime.UtcNow },
                    new Catalogo { Tipo = "TipoReporte", Codigo = "Asalto", Nombre = "Asalto", Descripcion = "Asalto a persona", Activo = true, CreadoEn = DateTime.UtcNow },
                    new Catalogo { Tipo = "TipoReporte", Codigo = "Accidente", Nombre = "Accidente", Descripcion = "Accidente de tránsito", Activo = true, CreadoEn = DateTime.UtcNow },
                    new Catalogo { Tipo = "TipoReporte", Codigo = "ZonaOscura", Nombre = "Zona Oscura", Descripcion = "Área con poca iluminación", Activo = true, CreadoEn = DateTime.UtcNow },
                    new Catalogo { Tipo = "TipoReporte", Codigo = "Vandalismo", Nombre = "Vandalismo", Descripcion = "Daños a propiedad pública o privada", Activo = true, CreadoEn = DateTime.UtcNow },
                    new Catalogo { Tipo = "TipoReporte", Codigo = "Otro", Nombre = "Otro", Descripcion = "Otro tipo de reporte", Activo = true, CreadoEn = DateTime.UtcNow },
                };
                Catalogos.AddRange(catalogos);
                await SaveChangesAsync();
            }

            if (!Proyectos.Any())
            {
                var proyectos = new[]
                {
                    new Proyecto { Nombre = "Proyecto Centro Histórico", Descripcion = "Mejorar la seguridad en el centro histórico", Estado = "Activo", FechaInicio = DateTime.UtcNow, CreadoEn = DateTime.UtcNow },
                    new Proyecto { Nombre = "Proyecto Barranco", Descripcion = "Implementar sistema de monitoreo en Barranco", Estado = "Activo", FechaInicio = DateTime.UtcNow, CreadoEn = DateTime.UtcNow },
                };
                Proyectos.AddRange(proyectos);
                await SaveChangesAsync();
            }

            if (!Usuarios.Any(u => u.Email == "demo@usuario.com"))
            {
                var usuarios = new[]
                {
                    new Usuario
                    {
                        Nombre = "Usuario Demo",
                        Email = "demo@usuario.com",
                        PasswordHash = PasswordService.Hash("RutaSegura2025!"),
                        Telefono = "+51 999 888 777",
                        Rol = "Usuario",
                        Estado = "Activo",
                        FechaRegistro = DateTime.UtcNow
                    },
                    new Usuario
                    {
                        Nombre = "Admin Demo",
                        Email = "admin@admin.com",
                        PasswordHash = PasswordService.Hash("AdminSegura2026!"),
                        Telefono = "+51 999 888 000",
                        Rol = "Administrador",
                        Estado = "Activo",
                        FechaRegistro = DateTime.UtcNow
                    }
                };
                Usuarios.AddRange(usuarios);
                await SaveChangesAsync();
            }
            else
            {
                // Update passwords for existing demo users
                var demoUser = Usuarios.FirstOrDefault(u => u.Email == "demo@usuario.com");
                if (demoUser != null)
                {
                    demoUser.PasswordHash = PasswordService.Hash("RutaSegura2025!");
                }
                
                var adminUser = Usuarios.FirstOrDefault(u => u.Email == "admin@admin.com");
                if (adminUser != null)
                {
                    adminUser.PasswordHash = PasswordService.Hash("AdminSegura2026!");
                }
            }

            var demoUserId = Usuarios.FirstOrDefault(u => u.Email == "demo@usuario.com")?.Id;
            var catalogoRoboId = Catalogos.FirstOrDefault(c => c.Codigo == "Robo")?.Id;
            var catalogoAsaltoId = Catalogos.FirstOrDefault(c => c.Codigo == "Asalto")?.Id;
            var proyectoBarrancoId = Proyectos.FirstOrDefault(p => p.Nombre.Contains("Barranco"))?.Id;
            var proyectoCentroId = Proyectos.FirstOrDefault(p => p.Nombre.Contains("Centro"))?.Id;

            if (!Contactos.Any() && demoUserId.HasValue)
            {
                var contactos = new[]
                {
                    new Contacto { UsuarioId = demoUserId.Value, Nombre = "Policía Nacional", Telefono = "105", Parentesco = "Emergencia", Prioridad = 1, EsPrincipal = true, CreadoEn = DateTime.UtcNow },
                    new Contacto { UsuarioId = demoUserId.Value, Nombre = "Bomberos", Telefono = "116", Parentesco = "Emergencia", Prioridad = 2, EsPrincipal = false, CreadoEn = DateTime.UtcNow },
                    new Contacto { UsuarioId = demoUserId.Value, Nombre = "Ambulancia", Telefono = "106", Parentesco = "Emergencia", Prioridad = 3, EsPrincipal = false, CreadoEn = DateTime.UtcNow },
                };
                Contactos.AddRange(contactos);
            }

            if (!Reportes.Any()
                && demoUserId.HasValue
                && catalogoRoboId.HasValue
                && catalogoAsaltoId.HasValue
                && proyectoBarrancoId.HasValue
                && proyectoCentroId.HasValue)
            {
                var reportes = new[]
                {
                    new Reporte
                    {
                        UsuarioId = demoUserId.Value,
                        CatalogoId = catalogoRoboId.Value,
                        ProyectoId = proyectoBarrancoId.Value,
                        TipoIncidente = "Robo",
                        Ubicacion = "Plaza Mayor, Lima",
                        Latitud = "-12.0464",
                        Longitud = "-77.0428",
                        Descripcion = "Robo de celular en Plaza Mayor",
                        Estado = "Pendiente",
                        NivelConfianzaIA = 75.0f,
                        EsAnonimo = false,
                        FechaReporte = DateTime.UtcNow
                    },
                    new Reporte
                    {
                        UsuarioId = demoUserId.Value,
                        CatalogoId = catalogoAsaltoId.Value,
                        ProyectoId = proyectoCentroId.Value,
                        TipoIncidente = "Asalto",
                        Ubicacion = "La Molina, Lima",
                        Latitud = "-12.0771",
                        Longitud = "-76.9422",
                        Descripcion = "Asalto reportado en zona residencial",
                        Estado = "Aprobado",
                        NivelConfianzaIA = 88.0f,
                        EsAnonimo = false,
                        FechaReporte = DateTime.UtcNow.AddDays(-2)
                    }
                };
                Reportes.AddRange(reportes);
            }

            if (demoUserId.HasValue
                && !UsuarioPreferencias.Any(p => p.UsuarioId == demoUserId.Value))
            {
                UsuarioPreferencias.Add(
                    new UsuarioPreferencias
                    {
                        UsuarioId = demoUserId.Value,
                        EvitarZonasOscurasNoche = true,
                        ModoMovilidadPredeterminado = "peaton",
                        AlertasRiesgoTiempoReal = true,
                        AvisoAutomaticoLlegada = true,
                        ActualizadoEn = DateTime.UtcNow,
                    });
            }

            if (!Catalogos.Any(c => c.Codigo == "Vandalismo"))
            {
                Catalogos.Add(
                    new Catalogo
                    {
                        Tipo = "TipoReporte",
                        Codigo = "Vandalismo",
                        Nombre = "Vandalismo",
                        Descripcion = "Daños a propiedad pública o privada",
                        Activo = true,
                        CreadoEn = DateTime.UtcNow,
                    });
            }

            await SaveChangesAsync();
        }
    }
}