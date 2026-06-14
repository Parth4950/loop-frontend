"use client";

/** Live campaign tracker — SSE-driven funnel, message stream, intervention, analysis. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  AnimatePresence,
  MotionConfig,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "framer-motion";
import {
  analyze,
  openCampaignStream,
  switchChannel,
  type Channel,
  type Insight,
  type Message,
  type MessageStatus,
} from "@/lib/api";
import { fadeUp, springIn, stagger } from "@/lib/motion";
import {
  Badge,
  Button,
  Card,
  ChannelPill,
  CountUp,
  Eyebrow,
  LivePulse,
  StatTile,
} from "@/components/ui";

const channelLabel = (c: Channel) =>
  c === "email"
    ? "Email"
    : c === "sms"
      ? "SMS"
      : c === "rcs"
        ? "RCS"
        : "WhatsApp";

/* The lifecycle order, used for the spectrum bar and the funnel ladder. */
const LADDER: MessageStatus[] = [
  "queued",
  "sent",
  "delivered",
  "read",
  "opened",
  "clicked",
  "converted",
  "retrying",
  "failed",
];

type Stats = {
  tiles: Record<CountKey, number>;
  dist: Record<MessageStatus, number>;
  total: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
};

/**
 * Derive funnel counts + rates from the live message list (always current),
 * recomputed on every render as messages update.
 *
 * Counts are CUMULATIVE: a message at stage X counts toward every earlier
 * stage, so sent >= delivered >= read >= opened >= clicked >= converted.
 * sent = total messages; failed is counted on its own.
 *
 * Rates use the SAME funnel formula as the analyze card (open = opened/
 * delivered, click = clicked/opened, conversion = converted/clicked),
 * divide-by-zero safe and rounded to one decimal to match it exactly.
 */
function deriveStats(messages: Message[]): Stats {
  const dist = {
    queued: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    opened: 0,
    clicked: 0,
    converted: 0,
    failed: 0,
    retrying: 0,
  } as Record<MessageStatus, number>;
  for (const m of messages) dist[m.status]++;

  const converted = dist.converted;
  const clicked = converted + dist.clicked;
  const opened = clicked + dist.opened;
  const read = opened + dist.read;
  const delivered = read + dist.delivered;
  const sent = messages.length; // everyone was sent; failed counted separately

  const rate = (num: number, den: number) =>
    den > 0 ? Math.round((num / den) * 1000) / 10 : 0;

  return {
    tiles: {
      sent,
      delivered,
      read,
      opened,
      clicked,
      converted,
      failed: dist.failed,
    },
    dist,
    total: messages.length,
    openRate: rate(opened, delivered),
    clickRate: rate(clicked, opened),
    conversionRate: rate(converted, clicked),
  };
}

export default function CampaignPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [name, setName] = useState("Campaign");
  const [channel, setChannel] = useState<Channel>("email");
  const [live, setLive] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [recommendation, setRecommendation] = useState<{
    text: string;
    suggested_channel: Channel;
  } | null>(null);

  // Tiles and rates are derived from the live message list — which the SSE
  // updates keep current — so they recompute on every status change.
  const stats = useMemo(() => deriveStats(messages), [messages]);

  // Subscribe to the campaign's live SSE feed for the tab's lifetime; the
  // cleanup closes the EventSource so we don't leak a connection.
  useEffect(() => {
    if (!id) return;

    const source = openCampaignStream(id, (event) => {
      // Branch on event shape. A recommendation drives the mid-campaign banner.
      if (event.type === "recommendation") {
        if (event.suggested_channel) {
          setRecommendation({
            text:
              event.text ?? "Consider switching channels to lift engagement.",
            suggested_channel: event.suggested_channel,
          });
        }
        return;
      }

      // The initial snapshot seeds the message list.
      if (event.type === "snapshot") {
        if (event.campaign_name) setName(event.campaign_name);
        if (event.channel) setChannel(event.channel);
        if (event.messages) {
          setMessages(event.messages);
          setVersions(Object.fromEntries(event.messages.map((m) => [m.id, 0])));
        }
        setLive(true);
        return;
      }

      // Everything else is a per-message update, keyed by message_id. The tiles
      // and rates recompute from the message list, so updating it is enough.
      if (event.message_id) {
        const mid = event.message_id;
        setMessages((prev) => {
          const at = event.at ?? new Date().toISOString();
          const idx = prev.findIndex((m) => m.id === mid);
          if (idx === -1) {
            return [
              ...prev,
              {
                id: mid,
                customer_name: event.customer_name ?? "—",
                status: event.status ?? "queued",
                at,
              },
            ];
          }
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            status: event.status ?? next[idx].status,
            customer_name: event.customer_name ?? next[idx].customer_name,
            at,
          };
          return next;
        });
        setVersions((v) => ({ ...v, [mid]: (v[mid] ?? 0) + 1 }));
        setLive(true);
      }
    });

    source.onerror = () => setLive(false);
    return () => source.close();
  }, [id]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 py-2">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-medium tracking-tight text-ink">
              {name}
            </h1>
            <ChannelPill channel={channel} />
          </div>
          {live && (
            <span className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-live">
              <LivePulse size={8} />
              Live
            </span>
          )}
        </header>

        {/* Intervention banner — approval #2 */}
        <AnimatePresence>
          {recommendation && (
            <InterventionBanner
              key="intervention"
              id={id}
              current={channel}
              recommendation={recommendation}
              onSwitched={(c) => setChannel(c)}
              onDismiss={() => setRecommendation(null)}
            />
          )}
        </AnimatePresence>

        {/* Metrics */}
        <Metrics stats={stats} />

        {/* Live stream + analysis */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <MessageStream messages={messages} versions={versions} />
          </div>
          <div className="lg:col-span-2">
            <Analysis id={id} converted={stats.tiles.converted} />
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ *
 * Metrics — spectrum bar, funnel tiles, rates
 * ------------------------------------------------------------------ */

type CountKey =
  | "sent"
  | "delivered"
  | "read"
  | "opened"
  | "clicked"
  | "converted"
  | "failed";

const TILES: { key: CountKey; label: string; status: MessageStatus }[] = [
  { key: "sent", label: "Sent", status: "sent" },
  { key: "delivered", label: "Delivered", status: "delivered" },
  { key: "read", label: "Read", status: "read" },
  { key: "opened", label: "Opened", status: "opened" },
  { key: "clicked", label: "Clicked", status: "clicked" },
  { key: "converted", label: "Converted", status: "converted" },
  { key: "failed", label: "Failed", status: "failed" },
];

function Metrics({ stats }: { stats: Stats }) {
  return (
    <Card className="flex flex-col gap-7">
      <SpectrumBar dist={stats.dist} total={stats.total} />

      <motion.div
        variants={stagger(0.05)}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-7"
      >
        {TILES.map((t) => (
          <motion.div key={t.key} variants={fadeUp}>
            <StatTile
              label={t.label}
              value={stats.tiles[t.key]}
              accent={`var(--color-${t.status})`}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Rates via the same funnel formula + ratePct formatter as the analyze
          card, so the tiles and the analyze readout always match. */}
      <div className="grid grid-cols-3 gap-6 border-t border-line pt-6">
        <RateTile
          label="Open rate"
          value={stats.openRate}
          accent="var(--color-opened)"
        />
        <RateTile
          label="Click rate"
          value={stats.clickRate}
          accent="var(--color-clicked)"
        />
        <RateTile
          label="Conversion"
          value={stats.conversionRate}
          accent="var(--color-converted)"
        />
      </div>
    </Card>
  );
}

/** A rate figure, rendered via the shared ratePct (no count-up). */
function RateTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: accent }}
          aria-hidden
        />
        <Eyebrow>{label}</Eyebrow>
      </div>
      <span className="font-mono text-3xl leading-none tracking-tight tabular-nums text-ink">
        {ratePct(value)}
      </span>
    </div>
  );
}

/** A quiet, slim distribution of where every message currently sits. */
function SpectrumBar({
  dist,
  total,
}: {
  dist: Record<MessageStatus, number>;
  total: number;
}) {
  return (
    <div
      className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-line"
      role="img"
      aria-label="Message status distribution"
    >
      {total > 0 &&
        LADDER.map((status) => {
          const w = (dist[status] / total) * 100;
          if (w === 0) return null;
          return (
            <motion.span
              key={status}
              initial={{ width: 0 }}
              animate={{ width: `${w}%` }}
              transition={{ duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
              style={{ backgroundColor: `var(--color-${status})` }}
              className="h-full"
            />
          );
        })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Intervention banner
 * ------------------------------------------------------------------ */

function InterventionBanner({
  id,
  current,
  recommendation,
  onSwitched,
  onDismiss,
}: {
  id: string;
  current: Channel;
  recommendation: { text: string; suggested_channel: Channel };
  onSwitched: (c: Channel) => void;
  onDismiss: () => void;
}) {
  const [switching, setSwitching] = useState(false);
  const [switched, setSwitched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = recommendation.suggested_channel;

  async function onSwitch() {
    setSwitching(true);
    setError(null);
    try {
      const plan = await switchChannel(id, target);
      onSwitched(plan.channel);
      setSwitched(true);
      setTimeout(onDismiss, 1500);
    } catch {
      setError(`Couldn't switch to ${channelLabel(target)}. Try again.`);
      setSwitching(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
    >
      <Card className="flex flex-col gap-4 border-live/30 bg-live-wash">
        <div className="flex items-center gap-2">
          <LivePulse size={8} />
          <Eyebrow className="text-live">Recommendation</Eyebrow>
        </div>
        <p className="max-w-2xl text-ink">{recommendation.text}</p>

        {switched ? (
          <p className="font-mono text-sm text-clicked">
            ✓ Switched to {channelLabel(target)}. Re-routing in flight.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {error && <p className="text-sm text-failed">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <Button onClick={onSwitch} disabled={switching}>
                {switching ? "Switching…" : `Switch to ${channelLabel(target)}`}
              </Button>
              <Button variant="ghost" onClick={onDismiss} disabled={switching}>
                Keep {channelLabel(current)}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * Live message stream
 * ------------------------------------------------------------------ */

function MessageStream({
  messages,
  versions,
}: {
  messages: Message[];
  versions: Record<string, number>;
}) {
  return (
    <Card padded={false} className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <Eyebrow>Live stream</Eyebrow>
        <span className="font-mono text-xs text-muted">
          {messages.length} messages
        </span>
      </div>
      {messages.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-muted">
          Waiting for the first sends to land.
        </div>
      ) : (
        <ul className="max-h-[460px] divide-y divide-line overflow-y-auto">
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} version={versions[m.id] ?? 0} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function MessageRow({
  message,
  version,
}: {
  message: Message;
  version: number;
}) {
  const flash = useMotionValue(0);
  const reduce = useReducedMotion();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    const controls = animate(flash, [1, 0], { duration: 1.1, ease: "easeOut" });
    return () => controls.stop();
  }, [version, reduce, flash]);

  return (
    <li className="relative">
      {/* Soft gold flash on change. */}
      <motion.span
        aria-hidden
        style={{ opacity: flash }}
        className="pointer-events-none absolute inset-0 bg-live/12"
      />
      <div className="relative flex items-center justify-between gap-4 px-5 py-3">
        <span className="truncate text-sm text-ink">
          {message.customer_name}
        </span>
        <div className="flex items-center gap-3">
          {message.at && (
            <time className="font-mono text-[11px] tabular-nums text-muted">
              {new Date(message.at).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </time>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={message.status}
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 3 }}
              transition={{ duration: 0.2 }}
            >
              <Badge status={message.status} />
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ *
 * Analysis
 * ------------------------------------------------------------------ */

function Analysis({ id, converted }: { id: string; converted: number }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setInsight(await analyze(id));
    } catch {
      setError("Couldn't analyze yet. Give it a moment, then try again.");
    } finally {
      setLoading(false);
    }
  }

  if (insight) return <InsightCard insight={insight} />;

  return (
    <Card className="flex h-full flex-col justify-between gap-5">
      <div className="flex flex-col gap-2">
        <Eyebrow>Results</Eyebrow>
        <p className="text-muted">
          {converted > 0
            ? "Conversions are landing. Pull the full readout when you're ready."
            : "Run the analysis once the funnel has moved."}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {error && <p className="text-sm text-failed">{error}</p>}
        <Button onClick={run} disabled={loading}>
          {loading ? "Analyzing…" : "Analyze results"}
        </Button>
      </div>
    </Card>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const counts: { label: string; value: number }[] = [
    { label: "Sent", value: safeNum(insight.sent) },
    { label: "Delivered", value: safeNum(insight.delivered) },
    { label: "Opened", value: safeNum(insight.opened) },
    { label: "Clicked", value: safeNum(insight.clicked) },
    { label: "Converted", value: safeNum(insight.converted) },
  ];

  return (
    <motion.div variants={springIn} initial="hidden" animate="visible">
      <Card className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <Eyebrow>Attributed revenue</Eyebrow>
          <CountUp
            value={safeNum(insight.revenue)}
            format={rupees}
            className="font-display text-5xl font-medium tabular-nums leading-none text-ink"
          />
        </div>

        <div className="grid grid-cols-3 gap-4 border-y border-line py-5">
          <MiniStat label="Open rate" value={ratePct(insight.open_rate)} />
          <MiniStat label="Click rate" value={ratePct(insight.click_rate)} />
          <MiniStat
            label="Conversion"
            value={ratePct(insight.conversion_rate)}
          />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-[11px] text-muted">
          {counts.map((c) => (
            <span key={c.label}>
              <span className="tabular-nums text-ink">
                {c.value.toLocaleString("en-IN")}
              </span>{" "}
              {c.label.toLowerCase()}
            </span>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <Readout
            label="What worked"
            tone="clicked"
            text={safeText(insight.what_worked)}
          />
          <Readout
            label="What didn't"
            tone="failed"
            text={safeText(insight.what_didnt)}
          />
          <Readout
            label="Next step"
            tone="live"
            text={safeText(insight.next_step)}
          />
        </div>
      </Card>
    </motion.div>
  );
}

/* Guards — the backend may omit fields or send NaN; never render "NaN". */
const safeNum = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const ratePct = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? `${v}%` : "0%";
const safeText = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : "—";

const rupees = (n: number) => `Rs ${Math.round(n).toLocaleString("en-IN")}`;

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <Eyebrow>{label}</Eyebrow>
      <span className="font-mono text-lg tabular-nums text-ink">{value}</span>
    </div>
  );
}

function Readout({
  label,
  tone,
  text,
}: {
  label: string;
  tone: "clicked" | "failed" | "live";
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <span
        className="mt-1 h-full w-0.5 shrink-0 rounded-full"
        style={{ backgroundColor: `var(--color-${tone})` }}
      />
      <div className="flex flex-col gap-1">
        <Eyebrow>{label}</Eyebrow>
        <p className="text-sm leading-relaxed text-ink/90">{text}</p>
      </div>
    </div>
  );
}
