"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card } from "@/components/ui";
import { formatNumber } from "@/lib/i18n/digits";
import { ADMIN_TYPES, UPLOAD_KINDS, type AdminType, type UploadKind } from "@/lib/admin/content";

type Row = Record<string, unknown> & { id: string; status: string };
type Status = "draft" | "approved" | "retired";
type Tab = "content" | "reports" | "upload";

async function json<T>(res: Promise<Response>): Promise<T> {
  return (await res).json();
}

/** Content admin: review drafts, resolve reports, upload CSV/JSON. */
export function AdminContent() {
  const t = useTranslations("admin");
  const [tab, setTab] = useState<Tab>("content");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {(["content", "reports", "upload"] as const).map((x) => (
          <button
            key={x}
            type="button"
            role="tab"
            aria-selected={tab === x}
            onClick={() => setTab(x)}
            data-testid={`admin-tab-${x}`}
            className={`min-h-11 rounded-full px-4 font-bold ${tab === x ? "bg-sunflower ink-border-thick" : "bg-paper ink-border"}`}
          >
            {t(x === "content" ? "navContent" : x === "reports" ? "navReports" : "navUpload")}
          </button>
        ))}
      </div>
      {tab === "content" && <ContentReview />}
      {tab === "reports" && <Reports />}
      {tab === "upload" && <Upload />}
    </div>
  );
}

function ContentReview() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [type, setType] = useState<AdminType>("questions");
  const [status, setStatus] = useState<Status>("draft");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sources, setSources] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await json<{ ok: boolean; rows: Row[]; counts: Record<string, number> }>(
      fetch(`/api/admin/content?type=${type}&status=${status}`, { cache: "no-store" }),
    );
    if (r.ok) {
      setRows(r.rows);
      setCounts(r.counts);
    }
  }, [type, status]);

  useEffect(() => {
    // Loading data from the server when the filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const act = async (id: string, action: "approve" | "retire" | "draft") => {
    setMessage(null);
    const sourceUrl = sources[id]?.trim() || undefined;
    const r = await json<{ ok: boolean; error?: string }>(
      fetch("/api/admin/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, id, action, sourceUrl }) }),
    );
    if (!r.ok) setMessage(r.error === "needs_source" ? t("needsSource") : r.error === "banned" ? t("banned") : t("linkFailed"));
    await load();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ADMIN_TYPES) as AdminType[]).map((x) => (
          <button
            key={x}
            type="button"
            aria-pressed={type === x}
            onClick={() => setType(x)}
            data-testid={`admin-type-${x}`}
            className={`min-h-11 rounded-full px-4 font-semibold ${type === x ? "bg-chair ink-border-thick" : "bg-paper ink-border"}`}
          >
            {t(`types.${x}`)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {(["draft", "approved", "retired"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            data-testid={`admin-status-${s}`}
            className={`min-h-11 rounded-full px-4 font-semibold ${status === s ? "bg-sunflower ink-border-thick" : "bg-paper ink-border"}`}
          >
            {t(`status.${s}`)} ({formatNumber(counts[s] ?? 0, locale)})
          </button>
        ))}
      </div>
      {message && (
        <p role="alert" className="font-bold text-tomato">
          {message}
        </p>
      )}
      {rows && rows.length === 0 && <p className="text-muted">{t("empty")}</p>}
      <ul className="flex flex-col gap-3" data-testid="admin-rows">
        {(rows ?? []).map((r) => (
          <li key={r.id} data-testid={`row-${r.id}`}>
            <Card className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted" dir="ltr">
                <code>{String(r.id).slice(0, 36)}</code>
                {["category", "difficulty", "event", "mood", "mood_min", "lang"].map((k) =>
                  r[k] !== undefined ? <span key={k}>· {String(r[k])}</span> : null,
                )}
              </div>
              <p className="text-lg font-bold" lang="ar" dir="auto">
                {String(r.question ?? r.text ?? r.word ?? "")}
              </p>
              {Array.isArray(r.options) && (
                <p dir="auto">
                  {(r.options as string[]).join(" · ")} —{" "}
                  <strong>{t("answer", { answer: (r.options as string[])[r.answer_index as number] })}</strong>
                </p>
              )}
              {type === "questions" && (
                <label className="flex flex-col gap-1 text-sm">
                  {t("source")}
                  <input
                    dir="ltr"
                    defaultValue={(r.source_url as string) ?? ""}
                    placeholder={t("sourcePlaceholder")}
                    onChange={(e) => setSources((s) => ({ ...s, [r.id]: e.target.value }))}
                    className="min-h-11 rounded-[12px] ink-border bg-cream px-3"
                  />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {r.status !== "approved" && (
                  <Button tone="chair" size="md" onClick={() => act(r.id, "approve")} data-testid={`approve-${r.id}`}>
                    {t("approve")}
                  </Button>
                )}
                {r.status !== "retired" && (
                  <Button tone="paper" size="md" onClick={() => act(r.id, "retire")}>
                    {t("retire")}
                  </Button>
                )}
                {r.status !== "draft" && (
                  <Button tone="paper" size="md" onClick={() => act(r.id, "draft")}>
                    {t("toDraft")}
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

type ReportItem = {
  id: string;
  question: string;
  options: string[];
  answer_index: number;
  source_url: string | null;
  status: string;
  times_shown: number;
  times_correct: number;
  reports: number;
  reasons: string[];
};

function Reports() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [items, setItems] = useState<ReportItem[] | null>(null);
  const load = useCallback(async () => {
    const r = await json<{ ok: boolean; items: ReportItem[] }>(fetch("/api/admin/reports", { cache: "no-store" }));
    if (r.ok) setItems(r.items);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const act = async (questionId: string, action: "resolve" | "retire") => {
    await fetch("/api/admin/reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionId, action }) });
    await load();
  };
  if (!items) return null;
  if (!items.length) return <p className="text-muted">{t("noReports")}</p>;
  return (
    <ul className="flex flex-col gap-3" data-testid="reports">
      {items.map((q) => (
        <li key={q.id} data-testid={`report-${q.id}`}>
          <Card className="flex flex-col gap-2">
            <p className="font-bold text-tomato">{t("reportsCount", { count: formatNumber(q.reports, locale) })}</p>
            <p className="text-lg font-bold" lang="ar" dir="rtl">
              {q.question}
            </p>
            <p dir="auto">
              {q.options.join(" · ")} — <strong>{t("answer", { answer: q.options[q.answer_index] })}</strong>
            </p>
            <p className="text-sm text-muted">
              {t("reportsStats", { shown: formatNumber(q.times_shown, locale), correct: formatNumber(q.times_correct, locale) })}
            </p>
            {q.source_url && (
              <a href={q.source_url} target="_blank" rel="noreferrer" className="text-sm underline" dir="ltr">
                {q.source_url}
              </a>
            )}
            <div className="flex flex-wrap gap-2">
              <Button tone="chair" size="md" onClick={() => act(q.id, "resolve")} data-testid={`resolve-${q.id}`}>
                {t("resolve")}
              </Button>
              <Button tone="tomato" size="md" onClick={() => act(q.id, "retire")} data-testid={`retire-${q.id}`}>
                {t("retireQuestion")}
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function Upload() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [kind, setKind] = useState<UploadKind>("questions");
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="display-text text-2xl">{t("uploadTitle")}</h2>
      <p className="text-sm text-muted">{t("uploadHelp")}</p>
      <p className="text-sm text-muted" dir="ltr">
        {t("csvColumns")}
      </p>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 font-bold">
          {t("kind")}
          <select value={kind} onChange={(e) => setKind(e.target.value as UploadKind)} className="min-h-11 rounded-[12px] ink-border bg-cream px-3" data-testid="upload-kind">
            {UPLOAD_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`types.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold">
          {t("format")}
          <select value={format} onChange={(e) => setFormat(e.target.value as "json" | "csv")} className="min-h-11 rounded-[12px] ink-border bg-cream px-3" data-testid="upload-format">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-bold">
          {t("file")}
          <input
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setText(await f.text());
              if (f.name.endsWith(".csv")) setFormat("csv");
              if (f.name.endsWith(".json")) setFormat("json");
            }}
            className="min-h-11"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 font-bold">
        {t("paste")}
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} dir="auto" className="rounded-[12px] ink-border bg-cream p-3 font-mono text-sm" data-testid="upload-text" />
      </label>
      <Button
        tone="sunflower"
        size="md"
        className="self-start"
        disabled={!text.trim()}
        data-testid="upload-submit"
        onClick={async () => {
          setError(null);
          setResult(null);
          const r = await json<{ ok: boolean; imported: number; errors: { row: number; message: string }[]; error?: string }>(
            fetch("/api/admin/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, format, text }) }),
          );
          if (r.ok) setResult({ imported: r.imported, errors: r.errors });
          else setError(r.error === "unreadable" ? t("unreadable") : t("linkFailed"));
        }}
      >
        {t("upload")}
      </Button>
      {error && (
        <p role="alert" className="font-bold text-tomato">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="flex flex-col gap-2" data-testid="upload-result">
          <p className="font-bold">{t("uploaded", { count: formatNumber(result.imported, locale) })}</p>
          {result.errors.length > 0 && (
            <>
              <p className="font-bold text-tomato">{t("uploadErrors", { count: formatNumber(result.errors.length, locale) })}</p>
              <ul className="text-sm" dir="ltr">
                {result.errors.slice(0, 20).map((e) => (
                  <li key={e.row}>
                    #{e.row}: {e.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
