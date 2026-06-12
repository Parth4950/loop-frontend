"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  runAgent,
  sendCampaign,
  simulate,
  type Channel,
  type Plan,
  type Projection,
} from "@/lib/api";
import { fadeUp, springIn, stagger } from "@/lib/motion";
import {
  Button,
  Card,
  ChannelPill,
  CountUp,
  Eyebrow,
  LivePulse,
  Ring,
  StatTile,
} from "@/components/ui";

const SUGGESTION =
  "Re-engage dormant coffee buyers who spent over Rs5000 but haven't ordered in 60 days.";

type Status = "idle" | "running" | "ready" | "error";

const channelLabel = (c: Channel) =>
  c === "email" ? "Email" : c === "sms" ? "SMS" : "WhatsApp";
/** Confidence arrives as a percentage (0–100); the Ring wants a 0–1 fraction. */
const toFraction = (n: number) => (n > 1 ? n / 100 : n);
/** A sensible alternate to compare against — WhatsApp is the strong default. */
const otherChannel = (c: Channel): Channel => (c === "whatsapp" ? "email" : "whatsapp");

/** Turn a backend agent-error reason into directive, in-voice copy. */
function agentErrorCopy(detail?: string): string {
  if (!detail)
    return "The agent stopped before finishing. Run the command again.";
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(detail))
    return "The agent's model is out of quota — Gemini returned 429. Check the backend's API key and billing, then run the command again.";
  return detail.length > 200 ? `${detail.slice(0, 200)}…` : detail;
}

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [steps, setSteps] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(text: string) {
    const trimmed = text.trim();
    if (!trimmed || status === "running") return;

    setStatus("running");
    setSteps([]);
    setPlan(null);
    setError(null);

    try {
      for await (const event of runAgent(trimmed)) {
        if (event.type === "timeline" && event.step) {
          setSteps((prev) => [...prev, event.step!]);
        } else if (event.type === "plan" && event.plan) {
          setPlan(event.plan);
          setStatus("ready");
        } else if (event.type === "error") {
          // The agent reported a reason — surface it instead of a generic copy.
          setError(agentErrorCopy(event.message ?? event.text));
          setStatus("error");
          return;
        }
      }
      setStatus((s) => (s === "running" ? "ready" : s));
    } catch {
      // A genuine transport failure — couldn't reach or read the stream.
      setError(
        "Loop lost the connection to the agent. Check the backend is running, then run the command again.",
      );
      setStatus("error");
    }
  }

  const running = status === "running";

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto flex max-w-3xl flex-col gap-12 py-6">
        {/* HERO — the command itself */}
        <section className="flex flex-col items-center gap-5 text-center">
          <Eyebrow>Campaign agent</Eyebrow>
          <h1 className="max-w-2xl font-display text-4xl font-medium leading-[1.1] tracking-tight text-ink sm:text-5xl">
            Describe a campaign. Loop runs it.
          </h1>
          <p className="max-w-md text-muted">
            One line in. A live audience, a crafted message, and a launch-ready
            plan out.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(prompt);
            }}
            className="mt-2 w-full max-w-2xl"
          >
            <div className="flex items-center gap-2 rounded-control border border-line bg-surface p-2 shadow-soft transition-colors duration-200 focus-within:border-live/40 focus-within:ring-2 focus-within:ring-live/30">
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={running}
                placeholder="Describe the campaign you want to run…"
                aria-label="Campaign command"
                className="h-11 flex-1 bg-transparent px-3 text-base text-ink outline-none placeholder:text-muted disabled:opacity-60"
              />
              <Button type="submit" disabled={running || !prompt.trim()}>
                {running ? "Running…" : "Run"}
              </Button>
            </div>
          </form>

          <button
            type="button"
            onClick={() => {
              setPrompt(SUGGESTION);
              run(SUGGESTION);
            }}
            disabled={running}
            className="max-w-2xl rounded-full border border-line bg-surface px-4 py-2 text-left text-sm text-muted transition-colors hover:border-live/40 hover:text-ink disabled:opacity-60"
          >
            {SUGGESTION}
          </button>
        </section>

        {/* ERROR — directive, in voice */}
        <AnimatePresence>
          {status === "error" && error && (
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              exit="hidden"
            >
              <Card className="flex flex-col items-start gap-3 border-failed/30">
                <Eyebrow className="text-failed">Run interrupted</Eyebrow>
                <p className="text-ink">{error}</p>
                <Button variant="secondary" onClick={() => run(prompt)}>
                  Run the command again
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* REASONING TRACE */}
        {(running || status === "ready") && (
          <Trace steps={steps} resolved={!!plan} />
        )}

        {/* PLAN CARD */}
        <AnimatePresence>
          {plan && (
            <motion.div
              key={plan.campaign_id}
              variants={springIn}
              initial="hidden"
              animate="visible"
            >
              <PlanView plan={plan} router={router} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

/* ------------------------------------------------------------------ *
 * Reasoning trace
 * ------------------------------------------------------------------ */

function Trace({ steps, resolved }: { steps: string[]; resolved: boolean }) {
  const waiting = steps.length === 0 && !resolved;

  return (
    <section className="mx-auto w-full max-w-xl">
      <Eyebrow>Agent reasoning</Eyebrow>
      <ol className="mt-4 flex flex-col">
        {waiting && <TraceShimmer />}
        {steps.map((label, i) => {
          // The latest received step is "thinking" until the plan resolves.
          const isActive = !resolved && i === steps.length - 1;
          return (
            <motion.li
              key={`${i}-${label}`}
              variants={springIn}
              initial="hidden"
              animate="visible"
              className="flex items-center gap-3 py-2.5"
            >
              <span className="grid size-5 place-items-center">
                {isActive ? <LivePulse size={9} /> : <Check />}
              </span>
              <span
                className={
                  isActive
                    ? "text-ink"
                    : "text-muted transition-colors duration-300"
                }
              >
                {label}
              </span>
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}

function TraceShimmer() {
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <span className="shimmer size-5 rounded-full" />
          <span className="shimmer h-3 rounded" style={{ width: 160 + i * 28 }} />
        </div>
      ))}
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 text-muted" aria-hidden>
      <path
        d="M5 10.5l3.2 3.2L15 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * Plan card
 * ------------------------------------------------------------------ */

function PlanView({
  plan,
  router,
}: {
  plan: Plan;
  router: ReturnType<typeof useRouter>;
}) {
  const [sqlOpen, setSqlOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [alt, setAlt] = useState<Projection | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const other = otherChannel(plan.channel);

  async function approve() {
    setLaunching(true);
    setActionError(null);
    try {
      await sendCampaign(plan.campaign_id);
      router.push(`/campaigns/${plan.campaign_id}`);
    } catch {
      setActionError("Launch didn't go through. Try approving again.");
      setLaunching(false);
    }
  }

  async function compare() {
    if (alt) {
      setAlt(null);
      return;
    }
    setComparing(true);
    setActionError(null);
    try {
      setAlt(await simulate(plan.audience_size, other));
    } catch {
      setActionError(`Couldn't simulate ${channelLabel(other)} right now.`);
    } finally {
      setComparing(false);
    }
  }

  return (
    <Card className="flex flex-col gap-8">
      {/* Header: channel, audience, confidence */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-4">
          <ChannelPill channel={plan.channel} />
          <div className="flex items-baseline gap-2">
            <CountUp
              value={plan.audience_size}
              className="font-display text-5xl font-medium tabular-nums leading-none text-ink"
            />
            <span className="text-muted">customers</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <Ring value={toFraction(plan.confidence)} />
          <Eyebrow>Confidence</Eyebrow>
        </div>
      </div>

      {plan.reason && (
        <p className="-mt-2 max-w-2xl leading-relaxed text-muted">
          {plan.reason}
        </p>
      )}

      {/* Projected performance */}
      <motion.div
        variants={stagger(0.07)}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-3 gap-6"
      >
        {(
          [
            ["Projected reach", plan.projected.projected_reach],
            ["Projected opens", plan.projected.projected_opens],
            ["Projected clicks", plan.projected.projected_clicks],
          ] as const
        ).map(([label, value]) => (
          <motion.div key={label} variants={fadeUp}>
            <StatTile label={label} value={value} />
          </motion.div>
        ))}
      </motion.div>

      {/* The crafted message */}
      <div>
        <Eyebrow>The message</Eyebrow>
        <figure className="mt-3 rounded-control border-l-2 border-live bg-live-wash px-5 py-4">
          {plan.subject && (
            <figcaption className="mb-1.5 font-display text-base font-medium text-ink">
              {plan.subject}
            </figcaption>
          )}
          <p className="whitespace-pre-line leading-relaxed text-ink/90">
            {plan.message}
          </p>
        </figure>
        {plan.memory_note && (
          <div className="mt-3 flex items-start gap-2 text-sm text-muted">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-live/70" />
            <span>
              <span className="font-mono text-[11px] uppercase tracking-wide text-live">
                memory
              </span>{" "}
              {plan.memory_note}
            </span>
          </div>
        )}
      </div>

      {/* View SQL */}
      <div>
        <button
          type="button"
          onClick={() => setSqlOpen((o) => !o)}
          aria-expanded={sqlOpen}
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-wide text-muted transition-colors hover:text-ink"
        >
          <Chevron open={sqlOpen} />
          {sqlOpen ? "Hide SQL" : "View SQL"}
        </button>
        <AnimatePresence initial={false}>
          {sqlOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
              className="overflow-hidden"
            >
              <pre className="mt-3 overflow-x-auto rounded-control bg-ink p-4 text-xs leading-relaxed text-canvas/90">
                <code className="font-mono">{plan.compiled_sql}</code>
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Explainability */}
      <div className="grid grid-cols-1 gap-6 border-t border-line pt-6 sm:grid-cols-2">
        <Reasons title="Included" text={plan.explainability?.included} />
        <Reasons title="Excluded" text={plan.explainability?.excluded} />
      </div>

      {/* Channel comparison */}
      <AnimatePresence>
        {alt && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
            className="overflow-hidden"
          >
            <Compare
              chosen={plan.channel}
              alternate={other}
              chosenProj={plan.projected}
              altProj={alt}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        {actionError && <p className="text-sm text-failed">{actionError}</p>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={approve} disabled={launching}>
            {launching ? "Launching…" : "Approve & launch"}
          </Button>
          <Button variant="secondary" onClick={compare} disabled={comparing}>
            {alt
              ? "Hide comparison"
              : comparing
                ? "Simulating…"
                : `Compare with ${channelLabel(other)}`}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function Reasons({ title, text }: { title: string; text?: string }) {
  // The backend sends one plain-language string; split clauses into bullets.
  const items = (text ?? "")
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-2.5">
      <Eyebrow>{title}</Eyebrow>
      {items.length === 0 ? (
        <p className="text-sm text-muted">—</p>
      ) : (
        <motion.ul
          variants={stagger(0.05)}
          initial="hidden"
          animate="visible"
          className="flex flex-col gap-2"
        >
          {items.map((item, i) => (
            <motion.li
              key={i}
              variants={fadeUp}
              className="flex items-start gap-2 text-sm text-ink/90"
            >
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted" />
              {item}
            </motion.li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}

function Compare({
  chosen,
  alternate,
  chosenProj,
  altProj,
}: {
  chosen: Channel;
  alternate: Channel;
  chosenProj: Projection;
  altProj: Projection;
}) {
  const metrics: { key: keyof Projection; label: string }[] = [
    { key: "projected_reach", label: "Reach" },
    { key: "projected_opens", label: "Opens" },
    { key: "projected_clicks", label: "Clicks" },
  ];

  return (
    <div className="rounded-control border border-line bg-canvas p-5">
      <div className="mb-4 flex items-center justify-between">
        <Eyebrow>
          {channelLabel(chosen)} vs {channelLabel(alternate)}
        </Eyebrow>
        <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-wide">
          <span className="flex items-center gap-1.5 text-ink">
            <span className="size-2 rounded-sm bg-ink" /> {channelLabel(chosen)}
          </span>
          <span className="flex items-center gap-1.5 text-muted">
            <span className="size-2 rounded-sm bg-muted" />{" "}
            {channelLabel(alternate)}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {metrics.map(({ key, label }) => {
          const a = chosenProj[key];
          const b = altProj[key];
          const max = Math.max(a, b, 1);
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <Eyebrow>{label}</Eyebrow>
              <MiniBar value={a} max={max} tone="ink" />
              <MiniBar value={b} max={max} tone="muted" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniBar({
  value,
  max,
  tone,
}: {
  value: number;
  max: number;
  tone: "ink" | "muted";
}) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/70">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 0.61, 0.36, 1] }}
          className={tone === "ink" ? "h-full bg-ink" : "h-full bg-muted"}
        />
      </div>
      <span className="w-14 text-right font-mono text-xs tabular-nums text-ink">
        {value.toLocaleString("en-US")}
      </span>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={`size-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path
        d="M6 4l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
