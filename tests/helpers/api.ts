// Appel d'une route d'API Next.js SANS serveur HTTP.
//
// On fabrique une requête et une réponse minimales, compatibles avec ce que
// les routes d'EduChat utilisent réellement (status/json/send/end/setHeader,
// writeHead/write pour le flux de complétion, req.on pour le corps brut du
// webhook PayPal). C'est ce qui fait de ces tests des tests FONCTIONNELS :
// la route entière s'exécute — gardes, base, règles —, seul le réseau manque.
import { EventEmitter } from 'events';

export type ApiHandler = (req: any, res: any) => unknown | Promise<unknown>;

export type OptionsAppel = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[]>;
  headers?: Record<string, string>;
  /** Adresse de l'appelant : posée en X-Real-IP (aucun proxy de confiance configuré en test). */
  ip?: string;
  /** Jeton de compte : posé en Authorization: Bearer. */
  token?: string;
  /** Corps brut (routes qui désactivent le parseur, ex. webhook PayPal). */
  rawBody?: string;
};

export type ReponseApi = {
  status: number;
  /** Corps JSON si la route a répondu par json(), sinon undefined. */
  json: any;
  /** Corps textuel (send/end/write concaténés). */
  text: string;
  headers: Record<string, unknown>;
  /** Pour les réponses en flux NDJSON : chaque ligne décodée. */
  lignes: any[];
};

export async function appeler(handler: ApiHandler, opts: OptionsAppel = {}): Promise<ReponseApi> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = v;
  if (opts.ip) headers['x-real-ip'] = opts.ip;
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;

  const req: any = new EventEmitter();
  req.method = opts.method ?? 'GET';
  req.body = opts.body;
  req.query = opts.query ?? {};
  req.headers = headers;
  req.socket = { remoteAddress: '::ffff:10.99.99.99' };
  if (opts.rawBody !== undefined) {
    // Le corps brut est émis au prochain tour de boucle, après que la route
    // a posé ses écouteurs.
    setImmediate(() => { req.emit('data', Buffer.from(opts.rawBody!)); req.emit('end'); });
  }

  const out: ReponseApi = { status: 200, json: undefined, text: '', headers: {}, lignes: [] };
  let fini: () => void;
  const termine = new Promise<void>(r => { fini = r; });
  const res: any = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    status(code: number) { out.status = code; this.statusCode = code; return this; },
    setHeader(k: string, v: unknown) { out.headers[k.toLowerCase()] = v; return this; },
    getHeader(k: string) { return out.headers[k.toLowerCase()]; },
    writeHead(code: number, h?: Record<string, unknown>) {
      out.status = code; this.statusCode = code; this.headersSent = true;
      for (const [k, v] of Object.entries(h ?? {})) out.headers[k.toLowerCase()] = v;
      return this;
    },
    flushHeaders() { this.headersSent = true; },
    write(chunk: unknown) { this.headersSent = true; out.text += String(chunk); return true; },
    json(body: unknown) { out.json = body; this.headersSent = true; return this.end(); },
    send(body: unknown) {
      if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) out.json = body;
      else out.text += Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '');
      return this.end();
    },
    end(chunk?: unknown) {
      if (chunk !== undefined) out.text += String(chunk);
      this.writableEnded = true; this.headersSent = true; fini(); return this;
    },
    on() { return this; },
    once() { return this; },
  };

  const retour = handler(req, res);
  await Promise.race([Promise.resolve(retour), termine]);
  await Promise.resolve(retour);
  out.lignes = out.text.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return l; } });
  return out;
}
