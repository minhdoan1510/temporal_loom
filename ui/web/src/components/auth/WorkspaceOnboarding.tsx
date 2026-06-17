import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BarChart3,
  Briefcase,
  CheckCircle2,
  GitBranch,
  LogOut,
  SearchCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useWorkspacesStore } from "@/stores/workspaces";
import { auth } from "@/lib/api";

type UseCase = {
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
};

const useCases: UseCase[] = [
  {
    title: "Kiểm tra hồ sơ vay",
    description: "Tóm tắt trạng thái onboarding, khoản vay, hợp đồng và bước đang kẹt.",
    prompt: "check 20260610-08022fa7-a266-4526-938e-ddb60e5aa15c",
    icon: SearchCheck,
  },
  {
    title: "So sánh đối tác",
    description: "Lập chart số lượng khoản vay, doanh số giải ngân và tỉ trọng từng partner.",
    prompt: "làm chart so sánh tỉ lệ giải ngân các đối tác xem",
    icon: BarChart3,
  },
  {
    title: "Phân tích funnel Cashloan",
    description: "Nhìn drop-off từ mở app tới eKYC, phê duyệt, ký hợp đồng và giải ngân.",
    prompt: "tỉ lệ chuyển đổi luồng Cashloan 7 ngày qua",
    icon: GitBranch,
  },
];

const traceSteps = [
  { title: "Xác thực OTP", detail: "Verify thành công lúc 09:04:41", status: "done" },
  { title: "Giải ngân", detail: "Nhận callback SHB lúc 09:05:07", status: "done" },
  { title: "Đồng bộ lịch trả nợ", detail: "Thất bại lúc 09:05:09", status: "error" },
];

const funnelStages = [
  { label: "Mở app", value: "100%", width: "100%" },
  { label: "Đăng ký", value: "63%", width: "70%" },
  { label: "eKYC", value: "30%", width: "45%" },
  { label: "Duyệt", value: "8%", width: "24%" },
  { label: "Giải ngân", value: "3%", width: "16%" },
];

// WorkspaceOnboarding is the empty first-run screen shown to an authenticated
// user who belongs to no workspace yet (e.g. a brand-new CAS SSO user). On
// success the page reloads to enter the normal app under the new workspace.
export default function WorkspaceOnboarding() {
  const createWorkspace = useWorkspacesStore((s) => s.createWorkspace);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    setError("");
    try {
      await createWorkspace(trimmed);
      window.location.reload();
    } catch {
      setError("Could not create workspace. Please try again.");
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#edf5ff] text-foreground tracking-normal">
      <main className="mx-auto flex min-h-dvh w-full max-w-7xl items-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid w-full overflow-hidden rounded-2xl border border-[#d7e3f2] bg-white shadow-[0_24px_80px_rgba(24,45,78,0.12)] lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 px-5 py-6 sm:p-8 lg:p-10">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Briefcase className="size-5" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-primary">
                  Lending Claw Workspace
                </p>
                <p className="text-sm text-muted-foreground">
                  CS investigation hub for Cashloan
                </p>
              </div>
            </div>

            <div className="mt-8 max-w-3xl">
              <h1 className="font-heading text-3xl font-semibold leading-tight text-[#18212f] sm:text-4xl">
                Bắt đầu workspace điều tra Cashloan
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
                Workspace gom chat, skill và dữ liệu tra cứu vào cùng một nơi để
                phân tích hồ sơ vay, dòng onboarding và hiệu quả từng đối tác.
              </p>
            </div>

            <div className="mt-7" aria-label="Use cases điển hình">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-heading text-base font-semibold text-[#18212f]">
                  Use case điển hình
                </h2>
                <span className="hidden rounded-full border border-[#d7e3f2] px-3 py-1 text-xs font-medium text-muted-foreground sm:inline-flex">
                  Dựa trên luồng CS hằng ngày
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {useCases.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article
                      key={item.title}
                      className="min-w-0 rounded-xl border border-[#dfe8f3] bg-[#fbfdff] p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </span>
                        <h3 className="min-w-0 truncate font-heading text-sm font-semibold text-[#18212f]">
                          {item.title}
                        </h3>
                      </div>
                      <p className="mt-3 min-h-12 text-sm leading-6 text-muted-foreground">
                        {item.description}
                      </p>
                      <p className="mt-3 break-words rounded-lg bg-white px-3 py-2 font-mono text-[11px] leading-5 text-[#4d5a6a] shadow-[inset_0_0_0_1px_#e5edf7]">
                        {item.prompt}
                      </p>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="mt-7 grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <LoanTracePreview />
              <FunnelPreview />
            </div>
          </section>

          <aside className="flex min-w-0 flex-col justify-between border-t border-[#d7e3f2] bg-[#f8fbff] p-5 sm:p-6 lg:border-l lg:border-t-0">
            <div>
              <div className="rounded-xl border border-[#dfe8f3] bg-white p-5 shadow-sm">
                <h2 className="font-heading text-lg font-semibold text-[#18212f]">
                  Tạo workspace đầu tiên
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Đặt tên workspace theo team, squad hoặc nhóm case để bắt đầu
                  lưu chat và skill riêng.
                </p>

                <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                  <div>
                    <label
                      htmlFor="workspace-name"
                      className="mb-1.5 block text-sm font-medium text-[#4d5a6a]"
                    >
                      Workspace name
                    </label>
                    <input
                      id="workspace-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Cashloan Ops"
                      autoComplete="organization"
                      className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={creating || !name.trim()}
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creating ? "Đang tạo..." : "Tạo workspace"}
                    {!creating && <ArrowRight className="size-4" />}
                  </button>
                </form>
              </div>

              <div className="mt-4 rounded-xl border border-[#dfe8f3] bg-white p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Sau khi tạo
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[#4d5a6a]">
                  <li>Chat mới được lưu trong workspace này.</li>
                  <li>Skills và quyền truy cập được tách theo workspace.</li>
                  <li>Dashboard dùng cùng phạm vi dữ liệu để theo dõi.</li>
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => auth.logout().then(() => window.location.reload())}
              className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-white hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </aside>
        </div>
      </main>
    </div>
  );
}

function LoanTracePreview() {
  return (
    <article className="min-w-0 rounded-xl border border-[#dfe8f3] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Preview kết quả
          </p>
          <h2 className="mt-1 font-heading text-lg font-semibold text-[#18212f]">
            Kết quả phân tích Trace ID
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            Khoản vay đã giải ngân nhưng lỗi khi lấy thông tin lịch trả nợ từ SHB.
          </p>
        </div>
        <span className="rounded-full bg-[#fff4e5] px-3 py-1 text-xs font-semibold text-[#b86100]">
          FINISH (Lỗi đồng bộ)
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Đối tác" value="SHB" detail="Hợp đồng 542603..." />
        <Metric label="Số tiền" value="18.000.000" detail="VND · kỳ hạn 9 tháng" />
        <Metric label="App Code" value="DG58E3B..." detail="20260304-1c68d729" />
      </div>

      <div className="mt-4 space-y-3">
        {traceSteps.map((step) => (
          <div key={step.title} className="flex gap-3">
            {step.status === "done" ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#12a150]" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
            )}
            <div className="min-w-0">
              <p className="font-medium text-[#18212f]">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function FunnelPreview() {
  return (
    <article className="rounded-xl border border-[#dfe8f3] bg-[#fbfdff] p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        Funnel Cashloan
      </p>
      <h2 className="mt-1 font-heading text-base font-semibold text-[#18212f]">
        Drop-off 7 ngày qua
      </h2>
      <div className="mt-4 space-y-3">
        {funnelStages.map((stage, index) => (
          <div key={stage.label}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-muted-foreground">{stage.label}</span>
              <span className="font-semibold text-[#18212f]">{stage.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#e8eef7]">
              <div
                className={
                  index === funnelStages.length - 1
                    ? "h-full rounded-full bg-[#ff3e00]"
                    : "h-full rounded-full bg-[#343a40]"
                }
                style={{ width: stage.width }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[#e5edf7] bg-[#fbfdff] p-3">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-heading text-xl font-semibold text-[#18212f]">
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
