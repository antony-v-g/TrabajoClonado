using System.Text.Json;
using System.Text.Json.Serialization;

namespace RutaSegura.Services;

/// <summary>Opciones JSON alineadas con la API (camelCase) para caché Redis.</summary>
public static class ApiJson
{
    public static readonly JsonSerializerOptions Options = CreateOptions();

    public static JsonSerializerOptions CreateOptions()
    {
        var o = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true,
        };
        o.Converters.Add(new UtcDateTimeJsonConverter());
        o.Converters.Add(new NullableUtcDateTimeJsonConverter());
        return o;
    }

    public static string Serialize<T>(T value) =>
        JsonSerializer.Serialize(value, Options);

    public static T? Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, Options);
}
