import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { Trash2, MessageSquare, Search, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import type { SessionInfo } from "@/types/api";
import { sessions } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SessionsPage() {
  const navigate = useNavigate();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canCreate = hasPermission("tab:sessions:create");
  const canDelete = hasPermission("tab:sessions:delete");
  const [data, setData] = useState<SessionInfo[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    sessions
      .list()
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete session "${key}"?`)) return;
    await sessions.delete(key);
    toast.success("Session deleted");
    load();
  };

  const filtered = useMemo(
    () =>
      data.filter((s) =>
        s.key.toLowerCase().includes(filter.toLowerCase())
      ),
    [data, filter]
  );

  // Pagination derived values. Snap page back to 1 whenever the filtered set
  // or page size changes so the user doesn't land on an out-of-range page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => {
    setPage(1);
  }, [filter, pageSize]);
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);

  const handleCreate = () => {
    const trimmed = newKey.trim();
    if (!trimmed) return;
    setNewOpen(false);
    setNewKey("");
    navigate(`/sessions/${encodeURIComponent(trimmed)}`);
  };

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-semibold sm:text-2xl">Sessions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage agent conversation sessions
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setNewOpen(true)} className="cursor-pointer gap-2 self-start rounded-lg sm:self-auto">
            <Plus className="size-4" />
            New Session
          </Button>
        )}
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Total Sessions</p>
          <p className="mt-1 font-heading text-2xl font-semibold">{data.length}</p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Total Messages</p>
          <p className="mt-1 font-heading text-2xl font-semibold">
            {data.reduce((a, s) => a + s.message_count, 0)}
          </p>
        </div>
        <div className="rounded-xl border border-border/50 bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Last Active</p>
          <p className="mt-1 font-heading text-2xl font-semibold">
            {data.length > 0
              ? new Date(
                  Math.max(...data.map((s) => new Date(s.updated_at).getTime()))
                ).toLocaleDateString()
              : "--"}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter sessions..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Loading sessions...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/50 text-sm text-muted-foreground">
          <MessageSquare className="size-8 text-muted-foreground/30" />
          No sessions found
        </div>
      ) : (
        <>
        <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
          <Table className="min-w-[640px]">
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Session Key
                </TableHead>
                <TableHead className="w-36 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Created By
                </TableHead>
                <TableHead className="w-28 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Messages
                </TableHead>
                <TableHead className="w-48 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Last Updated
                </TableHead>
                {canDelete && <TableHead className="w-12" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((s) => (
                <TableRow
                  key={s.key}
                  className="cursor-pointer border-border/30 transition-colors duration-150 hover:bg-muted/30"
                  onClick={() =>
                    navigate(`/sessions/${encodeURIComponent(s.key)}`)
                  }
                >
                  <TableCell className="max-w-[280px] truncate font-mono text-sm text-foreground">
                    {s.key}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.created_by || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {s.message_count}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(s.updated_at).toLocaleString()}
                  </TableCell>
                  {canDelete && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="cursor-pointer text-muted-foreground/40 hover:text-destructive"
                        onClick={(e) => handleDelete(s.key, e)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination footer */}
        <div className="mt-3 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 cursor-pointer rounded-md border border-border bg-card px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span className="text-xs">
              {filtered.length === 0
                ? "0"
                : `${pageStart + 1}–${Math.min(pageStart + pageSize, filtered.length)} of ${filtered.length}`}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="cursor-pointer gap-1 px-2"
            >
              <ChevronLeft className="size-3.5" />
              Prev
            </Button>
            <span className="px-2 text-xs">
              Page {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="cursor-pointer gap-1 px-2"
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
        </>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md border-border/50 bg-sidebar">
          <DialogHeader>
            <DialogTitle className="font-heading">New Session</DialogTitle>
          </DialogHeader>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
              Session Key
            </label>
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="e.g. ticket:LENDING-123"
              className="bg-card font-mono text-sm"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              A unique key to identify this session. The session will be created when you send the first message.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!newKey.trim()} className="cursor-pointer">
              Start Chat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
