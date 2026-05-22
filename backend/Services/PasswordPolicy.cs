using System.Text.RegularExpressions;

namespace RutaSegura.Services;

/// <summary>Reglas de contraseña fuerte (registro). El login solo verifica el hash guardado.</summary>
public static partial class PasswordPolicy
{
    public const string InvalidMessage =
        "La contraseña debe tener mínimo 16 caracteres, incluir mayúscula, número y carácter especial.";

    public static bool IsValid(string? password, out string? error)
    {
        error = null;
        if (string.IsNullOrEmpty(password))
        {
            error = InvalidMessage;
            return false;
        }

        if (password.Length < 16)
        {
            error = InvalidMessage;
            return false;
        }

        if (!UpperRegex().IsMatch(password))
        {
            error = InvalidMessage;
            return false;
        }

        if (!LowerRegex().IsMatch(password))
        {
            error = InvalidMessage;
            return false;
        }

        if (!DigitRegex().IsMatch(password))
        {
            error = InvalidMessage;
            return false;
        }

        if (!SpecialRegex().IsMatch(password))
        {
            error = InvalidMessage;
            return false;
        }

        return true;
    }

    [GeneratedRegex("[A-Z]")]
    private static partial Regex UpperRegex();

    [GeneratedRegex("[a-z]")]
    private static partial Regex LowerRegex();

    [GeneratedRegex("[0-9]")]
    private static partial Regex DigitRegex();

    [GeneratedRegex(@"[^A-Za-z0-9]")]
    private static partial Regex SpecialRegex();
}
