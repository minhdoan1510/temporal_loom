import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Search, FileText, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface FileItem {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
}

export default function FilesPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [filter, setFilter] = useState("");
  const [newName, setNewName] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newType, setNewType] = useState("PDF");

  useEffect(() => {
    const saved = localStorage.getItem("dashboard_files");
    if (saved) {
      setFiles(JSON.parse(saved));
    } else {
      const initial = [
        {
          id: "1",
          name: "lending_policy_v2.pdf",
          size: "2.4 MB",
          type: "PDF",
          uploadedAt: new Date().toLocaleDateString(),
        },
        {
          id: "2",
          name: "operations_checklist.txt",
          size: "45 KB",
          type: "Text",
          uploadedAt: new Date().toLocaleDateString(),
        },
      ];
      setFiles(initial);
      localStorage.setItem("dashboard_files", JSON.stringify(initial));
    }
  }, []);

  const saveFiles = (newFiles: FileItem[]) => {
    setFiles(newFiles);
    localStorage.setItem("dashboard_files", JSON.stringify(newFiles));
  };

  const handleAdd = () => {
    const trimmedName = newName.trim();
    const trimmedSize = newSize.trim();
    if (!trimmedName || !trimmedSize) {
      toast.error("Please fill in file name and size");
      return;
    }
    const newFile: FileItem = {
      id: Date.now().toString(),
      name: trimmedName,
      size: trimmedSize,
      type: newType,
      uploadedAt: new Date().toLocaleDateString(),
    };
    saveFiles([...files, newFile]);
    setNewName("");
    setNewSize("");
    toast.success("File cataloged");
  };

  const handleDelete = (id: string) => {
    const updated = files.filter((f) => f.id !== id);
    saveFiles(updated);
    toast.success("File deleted");
  };

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(filter.toLowerCase())
  );

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
          <h2 className="font-heading text-xl font-bold text-neutral-800">Workspace Cabinets</h2>
          <p className="text-xs text-neutral-400">View and manage documents and reference materials</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Form to Catalog a File */}
        <div className="col-span-1 rounded-2xl border border-neutral-100 bg-white p-6 shadow-xs h-fit">
          <h3 className="text-sm font-bold text-neutral-700 mb-4">Catalog New File</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-neutral-400 block mb-1">File Name</label>
              <Input
                placeholder="e.g. guide_lending.pdf"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-neutral-50 border-neutral-200/60 focus:bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-400 block mb-1">File Size</label>
              <Input
                placeholder="e.g. 1.2 MB or 300 KB"
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
                className="bg-neutral-50 border-neutral-200/60 focus:bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-neutral-400 block mb-1">File Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full h-10 rounded-lg border border-neutral-200 bg-neutral-50 px-3 text-xs outline-none focus:border-neutral-300 focus:bg-white text-neutral-800 transition"
              >
                <option value="PDF">PDF Document</option>
                <option value="Text">Text File</option>
                <option value="Image">Image File</option>
                <option value="Spreadsheet">Spreadsheet</option>
              </select>
            </div>
            <Button onClick={handleAdd} className="cursor-pointer gap-1.5 w-full justify-center">
              <Plus className="size-4" />
              Upload Reference
            </Button>
          </div>
        </div>

        {/* Directory List */}
        <div className="col-span-1 lg:col-span-2 space-y-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
            <Input
              placeholder="Search files..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9 bg-white border-neutral-200/80"
            />
          </div>

          <div className="rounded-2xl border border-neutral-100 bg-white overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                    <th className="py-3 px-4">File Name</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Cataloged At</th>
                    <th className="py-3 px-4 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-neutral-50 hover:bg-neutral-50/50 transition group"
                    >
                      <td className="py-3.5 px-4 font-medium text-xs text-neutral-800 flex items-center gap-2">
                        <FileText className="size-4 text-neutral-400 shrink-0" />
                        <span className="truncate max-w-[200px]">{item.name}</span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold text-neutral-500">{item.type}</td>
                      <td className="py-3.5 px-4 text-xs text-neutral-500">{item.size}</td>
                      <td className="py-3.5 px-4 text-xs text-neutral-400">{item.uploadedAt}</td>
                      <td className="py-3.5 px-4">
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-neutral-300 hover:text-red-500 p-1 rounded-lg transition opacity-0 group-hover:opacity-100 cursor-pointer"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-neutral-400 italic">
                        No files in the folder catalog.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
