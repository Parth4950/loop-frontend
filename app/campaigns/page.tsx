"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { getCampaigns, type CampaignSummary, type MessageStatus } from "@/lib/api";
import { springIn, stagger } from "@/lib/motion";
import { Button, Card, ChannelPill, Eyebrow } from "@/components/ui";

/* Guards — the backend may send 0s or odd values; never render NaN/blank. */
const safeNum = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;
const ratePct = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? `${v}%` : "0%";
const rupees = (n: number) => `Rs ${Math.round(safeNum(n)).toLocaleString("en-IN")}`;
const formatDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

const FUNNEL: { key: keyof CampaignSummary; label: string; status: MessageStatus }[] = [
  { key: "sent", label: "sent", status: "sent" },
  { key: "delivered", label: "delivered", status: "delivered" },
  { key: "opened", label: "opened", status: "opened" },
  { key: "clicked", label: "clicked", status: "clicked" },
  { key: "converted", label: "converted", status: "converted" },
];

type Status = "loading" | "ready" | "error";

export default function CampaignsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  function retry() {
    setStatus("loading");
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await getCampaigns();
        list.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        if (active) {
          setCampaigns(list);
          setStatus("ready");
        }
      } catch {
        if (active) setStatus("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
          Campaigns
        </h1>
        <p className="max-w-xl text-muted">
          Every campaign Loop has run, newest first. Open one to watch it live
          or pull the results.
        </p>
      </header>

      {status === "loading" && <SkeletonGrid />}

      {status === "error" && (
        <Card className="flex flex-col items-start gap-3">
          <Eyebrow className="text-failed">Couldn&apos;t load campaigns</Eyebrow>
          <p className="text-ink">
            Loop couldn&apos;t reach the campaign history. Check the backend,
            then try again.
          </p>
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </Card>
      )}

      {status === "ready" &&
        (campaigns.length === 0 ? (
          <EmptyState onNew={() => router.push("/")} />
        ) : (
          <motion.div
            variants={stagger(0.05)}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {campaigns.map((c) => (
              <motion.div key={c.id} variants={springIn}>
                <CampaignCard
                  campaign={c}
                  onOpen={() => router.push(`/campaigns/${c.id}`)}
                />
              </motion.div>
            ))}
          </motion.div>
        ))}
    </div>
  );
}

function CampaignCard({
  campaign,
  onOpen,
}: {
  campaign: CampaignSummary;
  onOpen: () => void;
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex h-full cursor-pointer flex-col gap-5 outline-none transition-shadow duration-200 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-live/40"
    >
      {/* Name, channel, date */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-medium leading-snug tracking-tight text-ink">
            {campaign.name}
          </h2>
          <ChannelPill channel={campaign.channel} />
        </div>
        <time className="font-mono text-[11px] uppercase tracking-wide text-muted">
          {formatDate(campaign.created_at)}
        </time>
      </div>

      {/* Compact funnel */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 font-mono text-[11px] text-muted">
        {FUNNEL.map((f) => (
          <span key={f.key} className="inline-flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: `var(--color-${f.status})` }}
              aria-hidden
            />
            <span className="tabular-nums text-ink">
              {safeNum(campaign[f.key] as number).toLocaleString("en-IN")}
            </span>{" "}
            {f.label}
          </span>
        ))}
      </div>

      {/* Rates */}
      <div className="grid grid-cols-3 gap-3 border-t border-line pt-4">
        <Rate label="Open" value={campaign.open_rate} />
        <Rate label="Click" value={campaign.click_rate} />
        <Rate label="Conv." value={campaign.conversion_rate} />
      </div>

      {/* Revenue */}
      <div className="mt-auto flex flex-col gap-0.5">
        <Eyebrow>Attributed revenue</Eyebrow>
        <span className="font-display text-2xl font-medium tabular-nums text-ink">
          {rupees(campaign.revenue)}
        </span>
      </div>
    </Card>
  );
}

function Rate({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Eyebrow>{label}</Eyebrow>
      <span className="font-mono text-sm tabular-nums text-ink">
        {ratePct(value)}
      </span>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-4 py-16 text-center">
      <Eyebrow>No campaigns yet</Eyebrow>
      <p className="max-w-sm text-ink">
        Describe a campaign and Loop will run it — every one you launch lands
        here.
      </p>
      <Button onClick={onNew}>Start a campaign</Button>
    </Card>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Card key={i} className="flex h-full flex-col gap-5" aria-hidden>
          <div className="flex flex-col gap-2.5">
            <div className="shimmer h-5 w-2/3 rounded" />
            <div className="shimmer h-3 w-24 rounded" />
          </div>
          <div className="shimmer h-3 w-full rounded" />
          <div className="shimmer h-10 w-full rounded" />
          <div className="shimmer mt-auto h-7 w-1/2 rounded" />
        </Card>
      ))}
    </div>
  );
}
