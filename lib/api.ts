/**
 * Loop API client.
 *
 * Talks to the agent backend at NEXT_PUBLIC_API_URL. Two transports:
 *  - runAgent():        a streaming POST (NDJSON) read off the response body.
 *  - openCampaignStream(): a native EventSource pointed straight at the backend.
 * Everything else is a typed fetch wrapper.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

/* ------------------------------------------------------------------ *
 * Domain types
 * ------------------------------------------------------------------ */

export type Channel = "email" | "sms" | "whatsapp";

/** Message lifecycle — mirrors the status tokens / Badge variants. */
export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "converted"
  | "failed"
  | "retrying";

/** Projected performance for a channel — drives StatTiles and compare bars. */
export interface Projection {
  projected_reach: number;
  projected_opens: number;
  projected_clicks: number;
}

/** Who's in and who's out, in plain language. */
export interface Explainability {
  included: string;
  excluded: string;
}

/** The campaign the agent proposes before launch. */
export interface Plan {
  campaign_id: string;
  channel: Channel;
  /** How many customers the segment resolves to. */
  audience_size: number;
  /** The agent's confidence, as a percentage 0–100. Drives the gold Ring. */
  confidence: number;
  /** The agent's rationale for the plan. */
  reason?: string;
  /** The crafted message copy. */
  message: string;
  /** Draft subject (email) — omitted for SMS / WhatsApp. */
  subject?: string;
  /** The SQL the agent compiled to resolve the audience. */
  compiled_sql: string;
  /** The structured filters behind the segment. */
  segment_filters?: Record<string, unknown>;
  /** Projected reach / opens / clicks for the chosen channel. */
  projected: Projection;
  explainability: Explainability;
  /** Optional note the agent recalled from prior campaigns. */
  memory_note?: string;
}

/** A single outbound message to one customer in the campaign. */
export interface Message {
  id: string;
  customer_name: string;
  status: MessageStatus;
  /** ISO timestamp of the last status change, if known. */
  at?: string;
}

/** Cumulative funnel counts at a point in time. */
export interface Aggregates {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
  failed: number;
}

/**
 * The result of analyze() — the post-run readout. Flat keys; any field may
 * be missing or NaN from the backend, so the UI guards every value.
 */
export interface Insight {
  /* Final funnel counts */
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  converted: number;
  /** Revenue attributed to the campaign (in rupees). */
  revenue: number;
  /* Rates, already expressed as percentages (0–100) */
  open_rate: number;
  click_rate: number;
  conversion_rate: number;
  /* Narrative */
  what_worked: string;
  what_didnt: string;
  next_step: string;
}

/** A line emitted by the agent while it reasons and acts. */
export interface AgentEvent {
  type: "timeline" | "plan" | "done" | "error";
  /** Present on `timeline` — the human label of the step now running. */
  step?: string;
  /** Present on `plan` — the finished campaign proposal. */
  plan?: Plan;
  /** Present on `error` — the backend's reason for failing the run. */
  message?: string;
  /** Some backends use `text` instead of `message` on `error`. */
  text?: string;
  /** ISO timestamp the backend stamped on the event. */
  at?: string;
}

/** An event pushed over the campaign EventSource. */
export interface CampaignEvent {
  type: "snapshot" | "update" | "recommendation";

  /* snapshot — the initial state of the campaign */
  campaign_name?: string;
  channel?: Channel;
  messages?: Message[];
  aggregates?: Aggregates;

  /* update — one message changed status */
  message_id?: string;
  customer_name?: string;
  status?: MessageStatus;
  /** e.g. "email.opened" — what the customer did. */
  event_type?: string;

  /* recommendation — the agent proposes an intervention */
  text?: string;
  suggested_channel?: Channel;

  at?: string;
}

/* ------------------------------------------------------------------ *
 * Streaming POST — the agent run
 * ------------------------------------------------------------------ */

/**
 * Run the agent for a prompt. Yields one parsed {@link AgentEvent} per
 * newline-delimited JSON line as the backend streams them.
 *
 * EventSource can't be used here because this is a POST with a body —
 * so we read the response body reader ourselves, decode, split on "\n",
 * and buffer the trailing partial line until the next chunk completes it.
 */
export async function* runAgent(prompt: string): AsyncGenerator<AgentEvent> {
  const res = await fetch(`${API_URL}/agent/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`Agent run failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last element — it may be a partial line — in the buffer.
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) yield JSON.parse(trimmed) as AgentEvent;
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Flush any complete line left in the buffer at stream end.
  const tail = buffer.trim();
  if (tail) yield JSON.parse(tail) as AgentEvent;
}

/* ------------------------------------------------------------------ *
 * Server-Sent Events — live campaign telemetry
 * ------------------------------------------------------------------ */

/**
 * Open the live telemetry stream for a campaign. Points the native
 * EventSource directly at the backend (not a Next route). Each event's
 * data is JSON-parsed and handed to `onEvent`. Returns the EventSource
 * so callers can `.close()` it.
 */
export function openCampaignStream(
  id: string,
  onEvent: (event: CampaignEvent) => void,
): EventSource {
  const source = new EventSource(`${API_URL}/campaigns/${id}/stream`);

  source.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as CampaignEvent);
    } catch {
      // Ignore malformed frames rather than tearing down the stream.
    }
  };

  return source;
}

/* ------------------------------------------------------------------ *
 * Typed fetch wrappers
 * ------------------------------------------------------------------ */

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed (${res.status})`);
  return res.json() as Promise<T>;
}

/** Launch an approved campaign. */
export function sendCampaign(id: string): Promise<{ id: string; status: "launched" }> {
  return request(`/campaigns/${id}/send`, { method: "POST" });
}

/** Dry-run a send for an audience on a channel to preview its projection. */
export function simulate(audienceSize: number, channel: Channel): Promise<Projection> {
  return request(`/agent/simulate`, {
    method: "POST",
    body: JSON.stringify({ segment_size: audienceSize, channel }),
  });
}

/** Switch a campaign's delivery channel and return the re-planned campaign. */
export function switchChannel(id: string, channel: Channel): Promise<Plan> {
  return request(`/campaigns/${id}/switch-channel`, {
    method: "POST",
    body: JSON.stringify({ new_channel: channel }),
  });
}

/** Ask the agent to analyze a finished campaign and return its readout. */
export function analyze(id: string): Promise<Insight> {
  return request(`/campaigns/${id}/analyze`, { method: "POST" });
}
