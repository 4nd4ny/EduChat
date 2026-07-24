// Appel client de /api/completion — avec ou sans streaming.
//
// Le serveur répond soit en JSON complet (repli gratuit, Gemini, erreurs),
// soit en NDJSON streamé (une ligne = un événement start/delta/done/error).
// Ce helper masque la différence : l'appelant fournit des callbacks optionnels
// et reçoit toujours le même résultat final. Utilisé par le chat principal ET
// par les modes duals (comparaison de tuteurs / de modèles).

export type CompletionBody = {
  provider: string;
  model?: string;
  apiKey?: string;
  reasoning?: string;
  promptName?: string;
  promptVersion?: number;
  shareToken?: string;
  clientId?: string;
  dual?: boolean;
  messages: { role: string; content: string }[];
  attachments?: { kind: string; mediaType: string; name: string; data: string }[];
};

export type CompletionResult = {
  reply: string;
  tokenUsage: number;
  provider: string;
  free: boolean;
  promptName?: string;
  promptVersion?: number;
};

export type CompletionHandlers = {
  /** Métadonnées reçues en tête de flux (fournisseur réellement utilisé...). */
  onStart?: (meta: { provider: string; free: boolean; promptName?: string; promptVersion?: number }) => void;
  /** Chaque fragment : texte cumulé + fragment brut. Sa présence ACTIVE le streaming. */
  onDelta?: (fullText: string, fragment: string) => void;
};

/** Erreur portant le code stable du serveur (traduit ensuite via i18n). */
export class CompletionError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export async function requestCompletion(
  body: CompletionBody,
  handlers: CompletionHandlers = {},
): Promise<CompletionResult> {
  const response = await fetch("/api/completion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: !!handlers.onDelta }),
  });

  const contentType = response.headers.get("content-type") || "";

  // Réponse JSON classique (erreur, repli gratuit, fournisseur sans flux).
  if (!contentType.includes("ndjson")) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new CompletionError(data?.error?.code || "ERR_UPSTREAM");
    return {
      reply: String(data.reply ?? ""),
      tokenUsage: Number(data.tokenUsage) || 0,
      provider: String(data.provider || body.provider),
      free: !!data.free,
      ...(data.promptName ? { promptName: data.promptName } : {}),
      ...(data.promptVersion ? { promptVersion: Number(data.promptVersion) } : {}),
    };
  }

  // Flux NDJSON : on assemble le texte au fil des événements.
  if (!response.body) throw new CompletionError("ERR_UPSTREAM");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let meta: Partial<CompletionResult> = {};

  const handleLine = (line: string): CompletionResult | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    let event: any;
    try { event = JSON.parse(trimmed); } catch { return null; }
    if (event.type === "start") {
      meta = {
        provider: String(event.provider || body.provider),
        free: !!event.free,
        ...(event.promptName ? { promptName: event.promptName } : {}),
        ...(event.promptVersion ? { promptVersion: Number(event.promptVersion) } : {}),
      };
      handlers.onStart?.(meta as any);
    } else if (event.type === "delta") {
      const fragment = String(event.text ?? "");
      text += fragment;
      handlers.onDelta?.(text, fragment);
    } else if (event.type === "done") {
      return {
        reply: text,
        tokenUsage: Number(event.tokenUsage) || 0,
        provider: meta.provider || body.provider,
        free: !!meta.free,
        ...(meta.promptName ? { promptName: meta.promptName } : {}),
        ...(meta.promptVersion ? { promptVersion: meta.promptVersion } : {}),
      };
    } else if (event.type === "error") {
      throw new CompletionError(String(event.code || "ERR_UPSTREAM"));
    }
    return null;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      const result = handleLine(line);
      if (result) return result;
    }
  }
  const result = handleLine(buffer);
  if (result) return result;

  // Flux interrompu sans événement final : erreur générique.
  throw new CompletionError("ERR_UPSTREAM");
}
