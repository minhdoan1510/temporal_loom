import zalopayLogo from "@/assets/zalopay-logo.png";

// CasLoading is the full-screen splash shown while the CAS service ticket is
// being exchanged for a session on the callback (/sso/cas?ticket=...).
export default function CasLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-100">
      <div className="flex w-full max-w-md flex-col items-center rounded-2xl border border-border/60 bg-white/90 px-10 py-12 shadow-xl backdrop-blur">
        <img
          src={zalopayLogo}
          alt="Zalopay"
          className="h-10 w-auto select-none"
          draggable={false}
        />

        <p className="mt-8 text-lg font-semibold text-slate-700">
          Authorizing with{" "}
          <span className="text-[#0045E6]">Zalopay</span>{" "}
          <span className="text-[#06BE68]">CAS</span>
        </p>

        <div className="my-6 h-px w-24 bg-slate-200" />

        <div className="size-14 animate-spin rounded-full border-4 border-blue-100 border-t-[#0045E6]" />

        <p className="mt-6 text-sm text-slate-400">Loading...</p>
      </div>
    </div>
  );
}
