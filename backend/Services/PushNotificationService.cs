using System.Net.Http.Json;
using System.Text.Json;

namespace RutaSegura.Services;

/// <summary>
/// Envío de alertas push: Firebase Cloud Messaging (legacy HTTP) o webhook configurado en admin.
/// No requiere Visual Studio Model Builder — solo la clave de servidor en .env.
/// </summary>
public class PushNotificationService
{
    private readonly IHttpClientFactory _http;
    private readonly ILogger<PushNotificationService> _logger;

    public PushNotificationService(IHttpClientFactory http, ILogger<PushNotificationService> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<PushSendResult> EnviarAlertaAsync(
        string titulo,
        string cuerpo,
        string? webhookUrl,
        CancellationToken ct = default)
    {
        var fcmKey = Environment.GetEnvironmentVariable("FIREBASE_SERVER_KEY")
            ?? Environment.GetEnvironmentVariable("FCM_SERVER_KEY");
        var topic = Environment.GetEnvironmentVariable("FCM_TOPIC") ?? "rutasegura-alertas";

        if (!string.IsNullOrWhiteSpace(fcmKey))
        {
            var fcm = await EnviarFcmAsync(titulo, cuerpo, fcmKey.Trim(), topic, ct);
            if (fcm.Enviado) return fcm;
        }

        if (!string.IsNullOrWhiteSpace(webhookUrl)
            && Uri.TryCreate(webhookUrl.Trim(), UriKind.Absolute, out var uri)
            && (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp))
        {
            return await EnviarWebhookAsync(titulo, cuerpo, uri.ToString(), ct);
        }

        return new PushSendResult(false, "Sin FCM ni webhook configurado (solo alerta en BD).", "none");
    }

    private async Task<PushSendResult> EnviarFcmAsync(
        string titulo,
        string cuerpo,
        string serverKey,
        string topic,
        CancellationToken ct)
    {
        try
        {
            var client = _http.CreateClient("push");
            client.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", $"key={serverKey}");
            var payload = new
            {
                to = $"/topics/{topic}",
                notification = new { title = titulo, body = cuerpo },
                data = new { origen = "RutaSegura", titulo, cuerpo },
            };
            var r = await client.PostAsJsonAsync("https://fcm.googleapis.com/fcm/send", payload, ct);
            if (r.IsSuccessStatusCode)
            {
                _logger.LogInformation("FCM enviado a topic {Topic}", topic);
                return new PushSendResult(true, $"Notificación FCM al topic «{topic}».", "fcm");
            }

            var err = await r.Content.ReadAsStringAsync(ct);
            _logger.LogWarning("FCM falló: {Status} {Body}", r.StatusCode, err);
            return new PushSendResult(false, $"FCM error {(int)r.StatusCode}", "fcm");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo enviar FCM");
            return new PushSendResult(false, ex.Message, "fcm");
        }
    }

    private async Task<PushSendResult> EnviarWebhookAsync(
        string titulo,
        string cuerpo,
        string url,
        CancellationToken ct)
    {
        try
        {
            var client = _http.CreateClient("push");
            var payload = new
            {
                titulo,
                cuerpo,
                origen = "RutaSegura",
                enviadoEnUtc = DateTime.UtcNow,
            };
            var r = await client.PostAsJsonAsync(url, payload, ct);
            if (r.IsSuccessStatusCode)
            {
                _logger.LogInformation("Webhook push enviado a {Url}", url);
                return new PushSendResult(true, "Webhook de notificación enviado.", "webhook");
            }

            return new PushSendResult(false, $"Webhook HTTP {(int)r.StatusCode}", "webhook");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Webhook push falló");
            return new PushSendResult(false, ex.Message, "webhook");
        }
    }
}

public record PushSendResult(bool Enviado, string Detalle, string Canal);
