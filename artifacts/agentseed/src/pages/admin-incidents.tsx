import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type IncidentRow = {
  source: "acp-tip" | "platform";
  kind: string;
  dedupKey: string;
  pdIncidentId: string | null;
  status: string;
  summary: string | null;
  openedAt: string | null;
  resolvedAt: string | null;
  context: Record<string, unknown>;
  pagerDuty: {
    id: string;
    status: string;
    url: string | null;
    summary: string | null;
    service: string | null;
    createdAt: string | null;
    resolvedAt: string | null;
    triageNotes: string[];
  } | null;
};

type IncidentsResponse = {
  pagerDutyConfigured: boolean;
  pagerDutyRestConfigured: boolean;
  incidents: IncidentRow[];
};

const STORAGE_KEY = "agentseed.adminSecret";

function statusVariant(status: string): "default" | "secondary" | "destructive" {
  if (status === "resolved" || status === "completed") return "secondary";
  if (
    status === "failed" ||
    status === "rejected" ||
    status === "expired" ||
    status === "open"
  )
    return "destructive";
  return "default";
}

export default function AdminIncidentsPage() {
  const apiBase = import.meta.env.VITE_API_URL ?? "";
  const baseRoot = apiBase.endsWith("/") ? apiBase.slice(0, -1) : apiBase;
  const [secret, setSecret] = useState<string>("");
  const [submittedSecret, setSubmittedSecret] = useState<string>("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSecret(stored);
      setSubmittedSecret(stored);
    }
  }, []);

  const query = useQuery<IncidentsResponse>({
    queryKey: ["admin-incidents", submittedSecret],
    enabled: submittedSecret.length > 0,
    queryFn: async () => {
      const res = await fetch(`${baseRoot}/api/admin/incidents`, {
        headers: { "x-admin-secret": submittedSecret },
      });
      if (!res.ok) {
        throw new Error(`Request failed (${res.status})`);
      }
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const incidents = query.data?.incidents ?? [];
  const sorted = useMemo(
    () =>
      [...incidents].sort((a, b) => {
        const aOpen = a.openedAt ? Date.parse(a.openedAt) : 0;
        const bOpen = b.openedAt ? Date.parse(b.openedAt) : 0;
        return bOpen - aOpen;
      }),
    [incidents],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem(STORAGE_KEY, secret);
    setSubmittedSecret(secret);
  };

  return (
    <div className="container max-w-5xl py-10 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Platform Incidents</h1>
        <p className="text-muted-foreground">
          Triage view for ACP settlement failures and heartbeat-worker
          incidents. Triage notes are written by the on-call SRE Agent in
          PagerDuty and read back here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="admin-secret">Admin shared secret</Label>
              <Input
                id="admin-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="ADMIN_SHARED_SECRET"
                autoComplete="off"
              />
            </div>
            <Button type="submit">Load incidents</Button>
          </form>
        </CardContent>
      </Card>

      {query.isError && (
        <Card>
          <CardContent className="pt-6 text-destructive">
            {(query.error as Error).message}
          </CardContent>
        </Card>
      )}

      {query.data && (
        <div className="text-sm text-muted-foreground space-x-2">
          <span>
            Events API:{" "}
            {query.data.pagerDutyConfigured ? (
              <Badge variant="secondary">configured</Badge>
            ) : (
              <Badge variant="destructive">disabled</Badge>
            )}
          </span>
          <span>
            REST API (triage notes):{" "}
            {query.data.pagerDutyRestConfigured ? (
              <Badge variant="secondary">configured</Badge>
            ) : (
              <Badge variant="destructive">disabled</Badge>
            )}
          </span>
          <span>
            · {sorted.length} incident{sorted.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {query.isLoading && submittedSecret.length > 0 && (
        <Card>
          <CardContent className="pt-6">Loading…</CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {sorted.map((inc) => (
          <Card key={`${inc.source}:${inc.dedupKey}`} data-testid={`incident-${inc.dedupKey}`}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    {inc.summary ?? inc.dedupKey}
                  </CardTitle>
                  <div className="text-xs text-muted-foreground mt-1">
                    {inc.source} · {inc.kind} · dedup={" "}
                    <code>{inc.dedupKey}</code>
                  </div>
                </div>
                <Badge variant={statusVariant(inc.status)}>{inc.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Opened:</span>{" "}
                  {inc.openedAt ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Resolved:</span>{" "}
                  {inc.resolvedAt ?? "—"}
                </div>
                {inc.pdIncidentId && (
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">PagerDuty ref:</span>{" "}
                    <code>{inc.pdIncidentId}</code>
                  </div>
                )}
              </div>

              {Object.keys(inc.context).length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    Context
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-muted p-3">
                    {JSON.stringify(inc.context, null, 2)}
                  </pre>
                </details>
              )}

              {inc.pagerDuty && (
                <div className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">
                      PagerDuty triage
                    </div>
                    {inc.pagerDuty.url && (
                      <a
                        className="text-xs underline"
                        href={inc.pagerDuty.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in PagerDuty
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Status: {inc.pagerDuty.status} · Service:{" "}
                    {inc.pagerDuty.service ?? "—"}
                  </div>
                  {inc.pagerDuty.triageNotes.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      No triage notes yet.
                    </div>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {inc.pagerDuty.triageNotes.map((note, i) => (
                        <li
                          key={i}
                          className="rounded bg-muted/60 p-2 whitespace-pre-wrap"
                        >
                          {note}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {query.data && sorted.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-muted-foreground">
              No incidents recorded.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
