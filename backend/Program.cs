using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using System.Security.Authentication;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using RutaSegura.Data;
using RutaSegura.ML;
using RutaSegura.Services;

static void LoadDotEnvFromProjectRoot()
{
    var candidates = new[]
    {
        Path.Combine(Directory.GetCurrentDirectory(), ".env"),
        Path.Combine(Directory.GetCurrentDirectory(), "..", ".env"),
        Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".env"),
    };
    foreach (var path in candidates.Select(Path.GetFullPath).Distinct())
    {
        if (!File.Exists(path)) continue;
        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            var eq = line.IndexOf('=');
            if (eq <= 0) continue;
            var key = line[..eq].Trim();
            var val = line[(eq + 1)..].Trim().Trim('"');
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key)))
                Environment.SetEnvironmentVariable(key, val);
        }
        break;
    }
}

LoadDotEnvFromProjectRoot();

var builder = WebApplication.CreateBuilder(args);

// Entrenar modelos ML sin Swagger ni Model Builder (VS 2026): dotnet run -- --train-ml
if (args.Contains("--train-ml", StringComparer.OrdinalIgnoreCase))
{
    builder.Services.AddDbContext<ApplicationDbContext>(options =>
        options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));
    builder.Services.AddSingleton<MlCsvDatasetLoader>();
    builder.Services.AddSingleton<MlModelTrainer>();

    var trainApp = builder.Build();
    using var scope = trainApp.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await db.Database.MigrateAsync();
    await ConfiguracionSchemaBootstrap.EnsureAlertasUmbralColumnsAsync(db);

    var trainer = scope.ServiceProvider.GetRequiredService<MlModelTrainer>();
    var result = await trainer.TrainAllAsync(db);

    Console.WriteLine("Modelos ML.NET entrenados:");
    Console.WriteLine($"  - Incidentes:     {trainer.ClassifierPath}");
    Console.WriteLine($"  - Zonas:          {trainer.ZoneSafetyPath} (métrica {result.ZoneSafety.PrimaryMetric:P1})");
    Console.WriteLine($"  - Rutas:          {trainer.RecommenderPath}");
    return;
}

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
        options.JsonSerializerOptions.Converters.Add(new UtcDateTimeJsonConverter());
        options.JsonSerializerOptions.Converters.Add(new NullableUtcDateTimeJsonConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Solo el token JWT (sin escribir Bearer; Swagger lo agrega solo).",
    });
    options.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
            },
            Array.Empty<string>()
        },
    });
});


var frontendUrl = builder.Configuration["FRONTEND_URL"] ?? "";
var isRender = builder.Configuration["RENDER"] == "true";

var allowedOrigins = new List<string>
{
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
};

if (!string.IsNullOrWhiteSpace(frontendUrl))
    allowedOrigins.Add(frontendUrl);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins(allowedOrigins.ToArray())
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});


builder.Services.AddHttpClient();
builder.Services.AddHttpClient("push");
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));


builder.Services.AddScoped<JwtService>();
builder.Services.AddSingleton<RedisService>();
builder.Services.AddSingleton<MlModelTrainer>();
builder.Services.AddSingleton<MlNetService>();
builder.Services.AddScoped<SistemaConfigService>();
builder.Services.AddScoped<DashboardAlertasService>();
builder.Services.AddScoped<AdminPredictivoService>();
builder.Services.AddScoped<AlertasInteligentesService>();
builder.Services.AddScoped<PushNotificationService>();
builder.Services.AddScoped<UsuarioPreferenciasService>();
builder.Services.AddSingleton<MlCsvDatasetLoader>();
builder.Services.AddScoped<MlZoneQueryService>();
builder.Services.AddScoped<ExternalApisService>();
builder.Services.AddScoped<ReporteGeocodingService>();
builder.Services.AddHostedService<MlStartupHostedService>();
builder.Services.AddHostedService<AlertasInteligentesBackgroundService>();


var jwtKey = builder.Configuration["Jwt:Key"] ?? throw new InvalidOperationException("JWT key is missing.");
var jwtIssuer = builder.Configuration["Jwt:Issuer"];
var jwtAudience = builder.Configuration["Jwt:Audience"];

builder.Services
    .AddAuthentication("Bearer")
    .AddJwtBearer("Bearer", options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = JwtSigningKey.CreateFromSecret(jwtKey),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
        };

        
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var jti = context.Principal?.FindFirstValue(JwtRegisteredClaimNames.Jti);
                if (string.IsNullOrEmpty(jti))
                    return;

                var redis = context.HttpContext.RequestServices.GetRequiredService<RedisService>();
                if (redis.IsEnabled)
                {
                    var cached = await redis.GetStringAsync($"sesion:{jti}");
                    if (cached is not null)
                        return;
                }

                var db = context.HttpContext.RequestServices
                    .GetRequiredService<ApplicationDbContext>();
                var sesion = await db.Sesiones.AsNoTracking()
                    .FirstOrDefaultAsync(
                        s => s.TokenJti == jti
                             && s.Estado == "Activa"
                             && s.ExpiraEn > DateTime.UtcNow);
                if (sesion is null)
                {
                    context.Fail(new AuthenticationException("Sesión revocada o expirada."));
                    return;
                }

                if (redis.IsEnabled)
                {
                    var ttl = sesion.ExpiraEn - DateTime.UtcNow;
                    if (ttl > TimeSpan.Zero)
                    {
                        await redis.SetStringAsync(
                            $"sesion:{jti}",
                            sesion.UsuarioId.ToString(),
                            ttl);
                    }
                }
            },
        };
    });

builder.Services.AddAuthorization();

var app = builder.Build();

if (app.Environment.IsDevelopment())
    app.UseDeveloperExceptionPage();

app.UseSwagger();
app.UseSwaggerUI();

if (!app.Environment.IsDevelopment() && !isRender)
    app.UseHttpsRedirection();

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

var webRootPath = RutaSegura.WwwrootPath.Resolve();
var webRootProvider = new PhysicalFileProvider(webRootPath);

var buildIdPath = Path.Combine(webRootPath, "build-id.txt");
var buildId = File.Exists(buildIdPath) ? File.ReadAllText(buildIdPath).Trim() : "(sin build)";
app.Logger.LogInformation(
    "Sirviendo wwwroot desde {WebRoot}. Build UI: {BuildId}. ContentRoot={ContentRoot}",
    webRootPath,
    buildId,
    app.Environment.ContentRootPath);

void DisableCaching(StaticFileResponseContext ctx)
{
    ctx.Context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
    ctx.Context.Response.Headers.Pragma = "no-cache";
    ctx.Context.Response.Headers.Expires = "0";
}

var staticFileOptions = new StaticFileOptions
{
    FileProvider = webRootProvider,
    RequestPath = "",
};
if (app.Environment.IsDevelopment())
    staticFileOptions.OnPrepareResponse = DisableCaching;

var fallbackOptions = new StaticFileOptions
{
    FileProvider = webRootProvider,
    RequestPath = "",
};
if (app.Environment.IsDevelopment())
    fallbackOptions.OnPrepareResponse = DisableCaching;

app.MapControllers();

if (app.Environment.IsDevelopment())
{
    app.MapGet("/api/dev/build-id", () =>
    {
        var path = Path.Combine(webRootPath, "build-id.txt");
        if (!File.Exists(path))
            return Results.NotFound("Sin build-id.txt. Ejecuta npm run build en la raíz.");
        return Results.Text(File.ReadAllText(path).Trim(), "text/plain");
    }).AllowAnonymous();
}

app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = webRootProvider });
app.UseStaticFiles(staticFileOptions);
app.MapFallbackToFile("index.html", fallbackOptions);

// Inicializar base de datos y seeding
using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await context.Database.MigrateAsync();
    await ConfiguracionSchemaBootstrap.EnsureAlertasUmbralColumnsAsync(context);
    await context.SeedDataAsync();
}

app.Run();