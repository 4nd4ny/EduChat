export const OpenAIApiKey: string = process.env.SECRET_OPENAI_API_KEY ?? '';
export const AnthropicApiKey: string = process.env.SECRET_ANTHROPIC_API_KEY ?? '';
export const SecretPasswords: string[] = process.env.SECRET_PASSWD ? process.env.SECRET_PASSWD.split(',').map(pwd => pwd.trim()): [];
export const AllowedHours: string = process.env.SECRET_ALLOWED_HOURS ?? '[]';
export const AllowedIps: string[] = process.env.SECRET_ALLOWED_IPS ? process.env.SECRET_ALLOWED_IPS.split(',').map(ip => ip.trim()).filter(ip => isValidIP(ip)): [];
export const SystemPrompt: string = "You are Claude, a helpful AI assistant created by Anthropic.";

// Fonction de validation d'IP : est-ce vraiment utile ?
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){2}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:))$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}
