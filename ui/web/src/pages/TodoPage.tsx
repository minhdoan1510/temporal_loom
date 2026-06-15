import { useState, useEffect } from "react";
import { Plus, Trash2, ArrowLeft, Check } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export default function TodoPage() {
  const navigate = useNavigate();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newText, setNewText] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("dashboard_todos");
    if (saved) {
      setTodos(JSON.parse(saved));
    }
  }, []);

  const saveTodos = (newTodos: Todo[]) => {
    setTodos(newTodos);
    localStorage.setItem("dashboard_todos", JSON.stringify(newTodos));
  };

  const handleToggle = (id: string) => {
    const updated = todos.map((t) =>
      t.id === id ? { ...t, completed: !t.completed } : t
    );
    saveTodos(updated);
  };

  const handleAdd = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    const newItem: Todo = {
      id: Date.now().toString(),
      text: trimmed,
      completed: false,
    };
    saveTodos([...todos, newItem]);
    setNewText("");
    toast.success("Task added");
  };

  const handleDelete = (id: string) => {
    const updated = todos.filter((t) => t.id !== id);
    saveTodos(updated);
    toast.success("Task removed");
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50 p-6">
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="rounded-lg p-1.5 hover:bg-neutral-200/50 text-neutral-500 transition cursor-pointer"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <h2 className="font-heading text-xl font-bold text-neutral-800">To Do Checklist</h2>
          <p className="text-xs text-neutral-400">Manage daily workspace assignments</p>
        </div>
      </div>

      <div className="max-w-xl rounded-2xl border border-neutral-100 bg-white p-6 shadow-xs">
        <div className="mb-4 flex gap-2">
          <Input
            placeholder="Add a new task..."
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="flex-1 bg-neutral-50 border-neutral-200/60 focus:bg-white"
          />
          <Button onClick={handleAdd} className="cursor-pointer gap-1 px-4">
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        <div className="space-y-1.5">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="flex items-center justify-between rounded-xl border border-neutral-50 p-3.5 hover:bg-neutral-50 transition"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                  onClick={() => handleToggle(todo.id)}
                  className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition cursor-pointer ${
                    todo.completed
                      ? "bg-primary border-primary text-white"
                      : "border-neutral-300 hover:border-neutral-400 bg-white"
                  }`}
                >
                  {todo.completed && <Check className="size-3.5" />}
                </button>
                <span
                  className={`text-sm font-semibold truncate ${
                    todo.completed ? "text-neutral-300 line-through" : "text-neutral-700"
                  }`}
                >
                  {todo.text}
                </span>
              </div>
              <button
                onClick={() => handleDelete(todo.id)}
                className="text-neutral-400 hover:text-red-500 p-1 rounded-lg transition cursor-pointer"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          {todos.length === 0 && (
            <div className="py-8 text-center text-sm text-neutral-400 italic">
              No tasks created yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
