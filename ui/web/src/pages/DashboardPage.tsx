import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Calendar,
  Cloud,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  ClipboardList,
  Check,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

interface Meeting {
  time: string;
  title: string;
  room: string;
  attendees: string[];
}

export default function DashboardPage() {
  const navigate = useNavigate();

  // Date state (dynamic)
  const [date, setDate] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = daysOfWeek[date.getDay()];
  const dayNum = date.getDate();

  // To Do state (persisted via localStorage to sync with TodoPage)
  const [todos, setTodos] = useState<Todo[]>([]);
  useEffect(() => {
    const saved = localStorage.getItem("dashboard_todos");
    if (saved) {
      setTodos(JSON.parse(saved));
    } else {
      const defaultTodos = [
        { id: "1", text: "release", completed: false },
        { id: "2", text: "prepare deck for review", completed: false },
        { id: "3", text: "sync with risks team", completed: true },
      ];
      setTodos(defaultTodos);
      localStorage.setItem("dashboard_todos", JSON.stringify(defaultTodos));
    }
  }, []);

  const saveTodos = (newTodos: Todo[]) => {
    setTodos(newTodos);
    localStorage.setItem("dashboard_todos", JSON.stringify(newTodos));
  };

  const toggleTodo = (id: string) => {
    const updated = todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    saveTodos(updated);
    toast.success("Task updated");
  };

  // Briefing preparation state
  const [briefingStatus, setBriefingStatus] = useState<"idle" | "loading" | "done">("idle");
  const [briefingText, setBriefingText] = useState("");

  const handlePrepareBriefing = () => {
    setBriefingStatus("loading");
    setTimeout(() => {
      const pendingCount = todos.filter((t) => !t.completed).length;
      setBriefingText(
        `Good day! You have ${pendingCount} pending task${pendingCount === 1 ? "" : "s"} remaining. The weather is currently clear and 32°C in Tan Thuan. Your next meeting is scheduled for 2:00 PM.`
      );
      setBriefingStatus("done");
      toast.success("Briefing prepared!");
    }, 1500);
  };

  // Meetings Carousel state
  const meetings: Meeting[] = [
    {
      time: "9:30 AM - 10:15 AM",
      title: "Daily Standup & Sync",
      room: "Meeting Room A",
      attendees: ["Alice", "Bob", "Charlie"],
    },
    {
      time: "2:00 PM - 3:00 PM",
      title: "Lending Policy Alignment",
      room: "War Room 1",
      attendees: ["Alice", "David", "Emma"],
    },
    {
      time: "4:30 PM - 5:00 PM",
      title: "Operations Retrospective",
      room: "Virtual (Teams)",
      attendees: ["Bob", "Frank"],
    },
  ];

  const [currentMeetingIdx, setCurrentMeetingIdx] = useState(0);

  const prevMeeting = () => {
    setCurrentMeetingIdx((prev) => (prev > 0 ? prev - 1 : meetings.length - 1));
  };

  const nextMeeting = () => {
    setCurrentMeetingIdx((prev) => (prev < meetings.length - 1 ? prev + 1 : 0));
  };

  // Quick Action triggers
  const handleQuickAction = (action: string) => {
    if (action === "people") {
      navigate("/people");
    } else if (action === "calendar") {
      toast.info("Opening calendar events...");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50 p-6">
      {/* Quick Actions Header */}
      <div className="mb-6 flex flex-wrap gap-2.5">
        <button
          onClick={() => handleQuickAction("people")}
          className="flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 shadow-xs transition hover:bg-neutral-100/70"
        >
          <span>Who should I follow up with this week?</span>
        </button>
        <button
          onClick={() => handleQuickAction("calendar")}
          className="flex items-center gap-2 rounded-full border border-neutral-200/80 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 shadow-xs transition hover:bg-neutral-100/70"
        >
          <span>What's next on my calendar?</span>
        </button>
      </div>

      {/* Responsive Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        
        {/* Row 1: Date & Weather Cards (Small Flex Grid or Separate) */}
        <div className="col-span-1 grid grid-cols-2 gap-5 md:col-span-2">
          {/* Card 1: Today's Date */}
          <div className="flex flex-col justify-between rounded-3xl bg-white p-6 shadow-xs border border-neutral-100">
            <div>
              <span className="text-xl font-bold tracking-tight text-[#FF3B30] uppercase">
                {dayName}
              </span>
            </div>
            <div className="mt-4">
              <span className="text-7xl font-bold tracking-tighter text-neutral-900 leading-none">
                {dayNum}
              </span>
            </div>
          </div>

          {/* Card 2: Weather */}
          <div className="flex flex-col justify-between rounded-3xl bg-white p-6 shadow-xs border border-neutral-100">
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-400">
                  <Cloud className="size-3 text-neutral-400" />
                  Tan Thuan, H...
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tighter text-neutral-900 leading-none">
                32°C
              </span>
              <span className="text-sm font-semibold text-neutral-400">Clear</span>
            </div>
          </div>
        </div>

        {/* Card 3: TODAY Briefing (Spans right column) */}
        <div className="col-span-1 flex flex-col justify-between rounded-3xl bg-white p-6 shadow-xs border border-neutral-100 md:row-span-1">
          <div>
            <div className="flex items-center gap-2 border-b border-neutral-50 pb-3">
              <ClipboardList className="size-4 text-neutral-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                TODAY
              </span>
            </div>
            <div className="mt-4">
              {briefingStatus === "idle" && (
                <p className="text-sm leading-relaxed text-neutral-500">
                  Your morning briefing appears here once it runs.
                </p>
              )}
              {briefingStatus === "loading" && (
                <div className="flex flex-col items-center justify-center py-4">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="mt-2 text-xs text-neutral-400">Analyzing your day...</p>
                </div>
              )}
              {briefingStatus === "done" && (
                <div className="rounded-2xl bg-neutral-50 p-4 border border-neutral-100/50">
                  <p className="text-sm leading-relaxed text-neutral-700 font-medium">
                    {briefingText}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 pt-3">
            {briefingStatus !== "loading" && (
              <button
                onClick={handlePrepareBriefing}
                className="text-sm font-semibold text-primary transition hover:text-primary-hover flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="size-3.5" />
                Prepare
              </button>
            )}
          </div>
        </div>

        {/* Card 4: MEETING PREP */}
        <div className="rounded-3xl bg-white p-6 shadow-xs border border-neutral-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-neutral-50 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="size-4 text-neutral-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  MEETING PREP
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={prevMeeting}
                  className="rounded-lg p-1 hover:bg-neutral-100 text-neutral-500 transition cursor-pointer"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  onClick={nextMeeting}
                  className="rounded-lg p-1 hover:bg-neutral-100 text-neutral-500 transition cursor-pointer"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
            
            <div className="mt-4">
              <span className="text-xs font-semibold text-[#0071E3] uppercase tracking-wide">
                {meetings[currentMeetingIdx].time}
              </span>
              <h3 className="mt-1 font-heading text-base font-bold text-neutral-900 leading-tight">
                {meetings[currentMeetingIdx].title}
              </h3>
              <p className="mt-1 text-xs text-neutral-400">
                {meetings[currentMeetingIdx].room}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 flex items-center gap-1.5">
            <span className="text-xs font-semibold text-neutral-400">Attendees:</span>
            <div className="flex items-center gap-1">
              {meetings[currentMeetingIdx].attendees.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center justify-center rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600 border border-neutral-200/40"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Card 5: UP NEXT */}
        <div className="rounded-3xl bg-white p-6 shadow-xs border border-neutral-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-neutral-50 pb-3">
              <Calendar className="size-4 text-neutral-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                UP NEXT
              </span>
            </div>
            
            <div className="mt-4">
              <span className="text-xs font-bold text-neutral-400">NEXT IMMEDIATE EVENT</span>
              <div className="mt-2.5 rounded-2xl bg-neutral-50/80 p-3 border border-neutral-100/50">
                <p className="text-xs font-semibold text-neutral-500">
                  {meetings[(currentMeetingIdx + 1) % meetings.length].time}
                </p>
                <p className="text-sm font-bold text-neutral-800 mt-0.5">
                  {meetings[(currentMeetingIdx + 1) % meetings.length].title}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3">
            <span className="text-xs text-neutral-400">
              Starts in about 2 hours
            </span>
          </div>
        </div>



        {/* Card 7: TO DO (Synced Checklist) */}
        <div className="rounded-3xl bg-white p-6 shadow-xs border border-neutral-100 flex flex-col justify-between md:col-span-1">
          <div>
            <div className="flex items-center justify-between border-b border-neutral-50 pb-3">
              <div 
                onClick={() => navigate("/todo")}
                className="flex items-center gap-2 cursor-pointer hover:opacity-80"
              >
                <ClipboardList className="size-4 text-neutral-500" />
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  TO DO
                </span>
              </div>
              <ChevronRight 
                onClick={() => navigate("/todo")}
                className="size-4 text-neutral-400 cursor-pointer" 
              />
            </div>

            <div className="mt-4 space-y-2">
              {todos.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-0.5">
                  <button
                    onClick={() => toggleTodo(t.id)}
                    className={`flex size-4.5 shrink-0 items-center justify-center rounded-md border transition cursor-pointer ${
                      t.completed
                        ? "bg-primary border-primary text-white"
                        : "border-neutral-300 hover:border-neutral-400 bg-white"
                    }`}
                  >
                    {t.completed && <Check className="size-3" />}
                  </button>
                  <span
                    className={`text-xs font-medium truncate ${
                      t.completed ? "text-neutral-300 line-through" : "text-neutral-700"
                    }`}
                  >
                    {t.text}
                  </span>
                </div>
              ))}
              {todos.length === 0 && (
                <p className="text-xs text-neutral-400 italic">No tasks left!</p>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 flex justify-between items-center text-[10px] text-neutral-400">
            <span>{todos.filter((t) => !t.completed).length} active tasks</span>
            <button
              onClick={() => navigate("/todo")}
              className="text-[10px] font-bold text-primary hover:underline cursor-pointer"
            >
              Manage all
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
