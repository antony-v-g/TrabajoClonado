using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using System.Security.Authentication;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using RutaSegura.Data;
using RutaSegura.ML;
using RutaSegura.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.PropertyNameCaseInsensitive = true;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();


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
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection")));


builder.Services.AddScoped<JwtService>();
builder.Services.AddSingleton<RedisService>();
builder.Services.AddSingleton<MlModelTrainer>();
builder.Services.AddSingleton<MlNetService>();
builder.Services.AddScoped<SistemaConfigService>();
builder.Services.AddScoped<DashboardAlertasService>();
builder.Services.AddScoped<UsuarioPreferenciasService>();
builder.Services.AddHostedService<MlStartupHostedService>();


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
                    var ok = await redis.GetStringAsync($"sesion:{jti}");
                    if (ok is null)
                        context.Fail(new AuthenticationException("Sesión revocada o expirada."));
                    return;
                }

                var db = context.HttpContext.RequestServices
                    .GetRequiredService<ApplicationDbContext>();
                var activa = await db.Sesiones.AnyAsync(
                    s => s.TokenJti == jti
                         && s.Estado == "Activa"
                         && s.ExpiraEn > DateTime.UtcNow);
                if (!activa)
                    context.Fail(new AuthenticationException("Sesión revocada o expirada."));
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