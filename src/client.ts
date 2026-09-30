import OpenAI from "openai";
import type { ClientOptions } from "openai";

import { InterfazeChat } from "./chat.js";
import { DEFAULT_TIMEOUT_MS, HEADERS, INTERFAZE_BASE_URL } from "./constants.js";
import { InterfazeError } from "./errors.js";
import { Tasks } from "./tasks.js";

/** Options for constructing an {@link Interfaze} client; extends the OpenAI `ClientOptions`. */
export interface InterfazeOptions extends ClientOptions {
  /** Emit `<precontext>` deltas while streaming (`x-show-additional-info`). */
  showAdditionalInfo?: boolean;
  /** Skip the mixture-of-architecture tool router (`x-interfaze-bypass-moa`). */
  bypassMoA?: boolean;
  /** Skip the semantic cache (`x-interfaze-bypass-cache`). */
  bypassCache?: boolean;
  /** Admin key that surfaces a `debug` field (`x-admin-key`). */
  adminKey?: string;
}

function envVar(name: string): string | undefined {
  return typeof process !== "undefined" && process.env ? process.env[name] : undefined;
}

/**
 * The openai client merges `OPENAI_CUSTOM_HEADERS` into every request. Those headers
 * are for api.openai.com (or a gateway in front of it), so null them out here; a
 * null default header tells the openai client to drop it.
 */
function openaiEnvHeaders(): Record<string, null> {
  const out: Record<string, null> = {};
  for (const line of envVar("OPENAI_CUSTOM_HEADERS")?.split("\n") ?? []) {
    const colon = line.indexOf(":");
    if (colon > 0) out[line.slice(0, colon).trim()] = null;
  }
  return out;
}

/**
 * `defaultHeaders` is openai's `HeadersLike`, so it may be a `Headers` instance or an
 * array of tuples. Spreading either gives `{}` or `{"0": [name, value]}`, which silently
 * drops every header the caller set.
 */
function headerRecord(given: ClientOptions["defaultHeaders"]): Record<string, unknown> {
  if (!given) return {};
  if ((typeof Headers !== "undefined" && given instanceof Headers) || Array.isArray(given)) {
    const out: Record<string, string> = {};
    new Headers(given as HeadersInit).forEach((value, name) => (out[name] = value));
    return out;
  }
  return { ...given };
}

function envKey(): string | undefined {
  return envVar("INTERFAZE_API_KEY");
}

/** Interfaze API client — an OpenAI-compatible client wired to the Interfaze endpoint. */
export class Interfaze {
  readonly openai: OpenAI;
  readonly chat: InterfazeChat;
  readonly models: OpenAI["models"];
  readonly tasks: Tasks;

  constructor(options: InterfazeOptions = {}) {
    const { showAdditionalInfo, bypassMoA, bypassCache, adminKey, apiKey, baseURL, defaultHeaders, ...rest } = options;

    const resolvedKey = apiKey ?? envKey();
    if (!resolvedKey) {
      throw new InterfazeError("Missing API key. Pass `new Interfaze({ apiKey })` or set the INTERFAZE_API_KEY environment variable.");
    }

    const headers = { ...openaiEnvHeaders(), ...headerRecord(defaultHeaders) } as Record<string, string | null>;
    if (showAdditionalInfo) headers[HEADERS.showAdditionalInfo] = "true";
    if (bypassMoA) headers[HEADERS.bypassMoA] = "true";
    if (bypassCache) headers[HEADERS.bypassCache] = "true";
    if (adminKey) headers[HEADERS.adminKey] = adminKey;

    this.openai = new OpenAI({
      ...rest,
      apiKey: resolvedKey,
      baseURL: baseURL ?? INTERFAZE_BASE_URL,
      // Left undefined, these fall back to OPENAI_ORG_ID / OPENAI_PROJECT_ID and get
      // sent to Interfaze as OpenAI-Organization / OpenAI-Project headers.
      organization: rest.organization ?? null,
      project: rest.project ?? null,
      defaultHeaders: headers,
      timeout: rest.timeout ?? DEFAULT_TIMEOUT_MS,
    });

    this.chat = new InterfazeChat(this.openai);
    this.models = this.openai.models;
    this.tasks = new Tasks(this.chat.completions);
  }
}

export default Interfaze;
