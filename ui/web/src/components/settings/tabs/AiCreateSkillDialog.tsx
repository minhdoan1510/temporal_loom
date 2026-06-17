import { useEffect, useMemo, useRef, useState } from "react";
import { ComarkClient } from "@comark/react";
import {
  Sparkles,
  Send,
  Check,
  AlertTriangle,
  FileText,
  RotateCw,
  FolderOpen,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import type { SkillFile, Message } from "@/types/api";
import { openai, skills } from "@/lib/api";
import { streamOpenAIChatCompletion } from "@/lib/sse";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import PhysicsGridSpinner from "@/components/ui/PhysicsGridSpinner";
import ChatMessage from "@/components/chat/ChatMessage";
import { ScrollArea } from "@/components/ui/scroll-area";

const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

function parseFrontmatter(content: string): { name: string; description: string; ok: boolean } {
  const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { name: "", description: "", ok: false };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (/^\s/.test(line)) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    fields[k] = v;
  }
  return { name: fields.name ?? "", description: fields.description ?? "", ok: true };
}

function validateMetadata(name: string, description: string): string {
  if (!name) return "SKILL.md frontmatter is missing `name`.";
  if (name.length > 64) return "name must be at most 64 characters.";
  if (!NAME_RE.test(name)) return "name must be lowercase letters, digits and hyphens.";
  if (/anthropic|claude/.test(name.toLowerCase())) return "name must not contain 'anthropic' or 'claude'.";
  if (!description.trim()) return "SKILL.md frontmatter is missing `description`.";
  if (description.length > 1024) return "description must be at most 1024 characters.";
  return "";
}

function parseIncremental(text: string): { skillMd: string; files: SkillFile[] } {
  const files: SkillFile[] = [];
  let skillMd = "";

  // Extract skill block
  const skillRegex = /```skill\s*\r?\n([\s\S]*?)(?:```|$)/;
  const skillMatch = skillRegex.exec(text);
  if (skillMatch) {
    skillMd = skillMatch[1];
  } else {
    const fmMatch = text.match(/(---\s*\r?\n[\s\S]*?\r?\n---)/);
    if (fmMatch) {
      skillMd = text;
    }
  }

  // Extract reference files
  const refRegex = /```reference:([^\s\n\r]+)\s*\r?\n([\s\S]*?)(?:```|$)/g;
  let match;
  while ((match = refRegex.exec(text)) !== null) {
    files.push({
      path: match[1],
      content: match[2].trim(),
    });
  }

  return { skillMd, files };
}

function cleanMessageForChat(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/```skill\s*\r?\n([\s\S]*?)(?:```|$)/g, "");
  cleaned = cleaned.replace(/```reference:([^\s\n\r]+)\s*\r?\n([\s\S]*?)(?:```|$)/g, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function GeneratedMarkdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <ComarkClient
      markdown={content}
      streaming={streaming}
      options={{ html: false }}
      className="min-w-0 space-y-2 break-words leading-relaxed [&_a]:text-indigo-400 [&_a]:underline-offset-2 [&_a:hover]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-medium [&_hr]:my-3 [&_hr]:border-border/40 [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border/30 [&_pre]:bg-[#0a0f1d] [&_pre]:p-3 [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_pre]:text-muted-foreground [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-semibold [&_table]:my-3 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:text-xs [&_td]:border [&_td]:border-border/30 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border/30 [&_th]:bg-muted/30 [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
    />
  );
}

const SUGGESTIONS = [
  {
    title: "Git Commit Helper",
    prompt: "Create a skill that helps write conventional commit messages (e.g. feat: add login, fix: correct button alignment). Please include a reference file named 'rules/commit_rules.md' containing a list of allowed prefixes and formatting guidelines.",
    description: "Semantic commit formatting & prefixes rules",
  },
  {
    title: "Go Test Writer",
    prompt: "Create a skill to generate Go unit tests. It should provide step-by-step guidelines for mock setup, testing happy paths and error cases using standard 'testify/require' assertions. Include a template test file at 'templates/sample_test.go'.",
    description: "Comprehensive Go test guidelines & templates",
  },
  {
    title: "OpenAPI Doc Validator",
    prompt: "Create a skill to validate OpenAPI spec definitions against custom API guidelines (e.g., path casing, standard error schemas, security headers). Include a rules definition in 'rules/openapi_rules.json'.",
    description: "Enterprise OpenAPI structure validation",
  },
];

const SKILL_GENERATION_SYSTEM_PROMPT = [
  "You are a specialized agent builder. Your goal is to write a single \"Skill\" bundle for this platform based on the user's request.",
  "A Skill consists of:",
  "1. A main SKILL.md file. This file MUST start with YAML frontmatter containing:",
  "---",
  "name: [lowercase-alphanumeric-name-with-hyphens]",
  "description: [concise description of when to use this skill]",
  "---",
  "Followed by the instructions markdown for the skill.",
  "",
  "2. Zero or more reference files (e.g., config templates, checklists, markdown files) that the skill references.",
  "",
  "You MUST wrap the SKILL.md content in a markdown code block labeled ```skill:",
  "```skill",
  "---",
  "name: my-skill-name",
  "description: A description.",
  "---",
  "# My Skill",
  "",
  "## Instructions",
  "...",
  "```",
  "",
  "If you need to define reference files, you MUST wrap each reference file's content in a markdown code block labeled ```reference:<path>``` where <path> is the relative file path. For example:",
  "```reference:rules/git.json",
  "{",
  "  \"format\": \"semantic\"",
  "}",
  "```",
  "",
  "Do not output code blocks inside the SKILL.md content that can confuse the parser. Make sure all instructions are clean.",
  "Provide a brief introduction explaining what you generated, but keep the core focus on outputting the code blocks so the parser reads them correctly.",
].join("\n");

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function AiCreateSkillDialog({ open, onOpenChange, onSaved }: Props) {
  const [prompt, setPrompt] = useState("");
  const [refinement, setRefinement] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [selectedFile, setSelectedFile] = useState("SKILL.md");
  const [saving, setSaving] = useState(false);

  // Local editable copies of parsed content
  const [localSkillMd, setLocalSkillMd] = useState("");
  const [localFiles, setLocalFiles] = useState<SkillFile[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll chat pane to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, streaming]);

  // Extract content from either active streaming content or latest assistant response
  const latestAssistantMessage = useMemo(() => {
    if (streaming) {
      return streamingContent;
    }
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        return messages[i].content;
      }
    }
    return "";
  }, [messages, streaming, streamingContent]);

  // Parse files from latest assistant message
  const parsed = useMemo(() => {
    if (!latestAssistantMessage) return null;
    return parseIncremental(latestAssistantMessage);
  }, [latestAssistantMessage]);

  // Update local editable files when new assistant chunks arrive
  useEffect(() => {
    if (parsed) {
      setLocalSkillMd(parsed.skillMd);
      setLocalFiles(parsed.files);
    }
  }, [parsed]);

  // Frontmatter parsing & validation on the local copies
  const fm = useMemo(() => parseFrontmatter(localSkillMd), [localSkillMd]);
  const metaError = useMemo(() => {
    if (!localSkillMd) return "Waiting for skill generation...";
    if (!fm.ok) {
      return "SKILL.md must start with YAML frontmatter (---).";
    }
    return validateMetadata(fm.name, fm.description);
  }, [fm, localSkillMd]);

  // Text contents for selected file in editor
  const currentContent = useMemo(() => {
    if (selectedFile === "SKILL.md") {
      return localSkillMd;
    }
    return localFiles.find((f) => f.path === selectedFile)?.content ?? "";
  }, [selectedFile, localSkillMd, localFiles]);

  const setCurrentContent = (val: string) => {
    if (selectedFile === "SKILL.md") {
      setLocalSkillMd(val);
    } else {
      setLocalFiles((prev) =>
        prev.map((f) => (f.path === selectedFile ? { ...f, content: val } : f))
      );
    }
  };

  const startStream = async (nextMessages: Message[]) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setStreaming(true);
    setStreamingContent("");

    try {
      const response = await openai.chatCompletionsStream(
        {
          messages: [
            { role: "system", content: SKILL_GENERATION_SYSTEM_PROMPT },
            ...nextMessages,
          ],
          max_tokens: 4096,
        },
        controller.signal
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(body.error || `HTTP ${response.status}`);
      }

      let fullContent = "";

      await streamOpenAIChatCompletion(
        response,
        (chunk) => {
          fullContent += chunk;
          setStreamingContent(fullContent);
        }
      );

      if (fullContent) {
        setMessages((prev) => [...prev, { role: "assistant", content: fullContent }]);
      }
      setStreamingContent("");
      setStreaming(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("Generation stopped by user.");
      } else {
        toast.error(err instanceof Error ? err.message : String(err));
      }
      setStreaming(false);
    }
  };

  const handleGenerate = () => {
    if (!prompt.trim()) return;

    const nextMsgs: Message[] = [{ role: "user", content: prompt }];
    setMessages(nextMsgs);
    startStream(nextMsgs);
  };

  const handleRefine = () => {
    if (!refinement.trim() || streaming) return;

    const userMsg = refinement;
    setRefinement("");

    const nextMsgs: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(nextMsgs);
    startStream(nextMsgs);
  };

  const handleStop = () => {
    abortControllerRef.current?.abort();
    setStreaming(false);
  };

  const handleStartOver = () => {
    if (messages.length > 0 && !confirm("Discard current generation and start over?")) return;
    setPrompt("");
    setRefinement("");
    setMessages([]);
    setStreamingContent("");
    setStreaming(false);
    setLocalSkillMd("");
    setLocalFiles([]);
    setSelectedFile("SKILL.md");
  };

  const handleSave = async () => {
    if (metaError) {
      toast.error(metaError);
      return;
    }
    setSaving(true);
    try {
      const payload = { content: localSkillMd, metadata: "", files: localFiles };
      const resp = await skills.create(payload);
      toast.success("Skill created successfully");
      if (resp.skipped_files && resp.skipped_files.length > 0) {
        toast.warning(`Skipped files: ${resp.skipped_files.join(", ")}`);
      }
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error("Failed to save skill.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !streaming && onOpenChange(val)}>
      <DialogContent className="flex h-[90vh] flex-col border-border/50 bg-sidebar sm:max-w-4xl lg:max-w-[90vw] transition-all duration-300">
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border/30 pb-3">
          <DialogTitle className="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
            <Sparkles className="size-5 text-indigo-500" />
            Create Skill with AI
          </DialogTitle>
        </DialogHeader>

        {messages.length === 0 ? (
          /* Welcome/Prompt entry screen */
          <div className="flex flex-1 flex-col items-center justify-center max-w-2xl mx-auto w-full gap-6 py-6">
            <div className="text-center space-y-2">
              <h3 className="font-heading text-2xl font-bold bg-gradient-to-r from-violet-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                What skill should we build today?
              </h3>
              <p className="text-sm text-muted-foreground">
                Describe the tasks, requirements, templates, or files you want in your skill bundle.
              </p>
            </div>

            <div className="w-full space-y-4">
              <Textarea
                placeholder="e.g., A git commit helper skill that checks commit messages for conventional commits structure, and has rules loaded from a reference JSON file."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="min-h-32 bg-card border-border/50 text-sm rounded-xl focus-visible:ring-1 focus-visible:ring-indigo-500 shadow-sm leading-relaxed"
              />

              <div className="flex justify-end">
                <Button
                  onClick={handleGenerate}
                  disabled={!prompt.trim()}
                  className="cursor-pointer gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white px-5 shadow-lg shadow-indigo-500/10 transition-all duration-200"
                >
                  <Sparkles className="size-4 animate-pulse" />
                  Generate Skill
                </Button>
              </div>
            </div>

            {/* suggestions */}
            <div className="w-full space-y-3 pt-4 border-t border-border/20">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Or start with a template
              </span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {SUGGESTIONS.map((sug) => (
                  <button
                    key={sug.title}
                    onClick={() => {
                      setPrompt(sug.prompt);
                    }}
                    className="flex flex-col text-left p-3 rounded-xl border border-border/40 bg-card hover:border-indigo-500/30 hover:bg-muted/20 transition duration-200 group cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-foreground group-hover:text-indigo-400 transition-colors">
                      {sug.title}
                    </span>
                    <span className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                      {sug.description}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Split Workspace Screen */
          <div className="flex flex-1 gap-4 overflow-hidden min-h-0 py-1">
            {/* Chat/Refinement column */}
            <div className="flex min-h-0 w-[38%] flex-col rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
              <div className="border-b border-border/50 px-4 py-2 bg-muted/20 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <FolderOpen className="size-3.5" />
                  AI Agent Chat
                </span>
                {streaming && (
                  <Button
                    size="xs"
                    variant="destructive"
                    onClick={handleStop}
                    className="h-6 text-[10px] px-2 rounded-md font-medium"
                  >
                    Stop
                  </Button>
                )}
              </div>

              <ScrollArea className="min-h-0 flex-1 p-3 bg-muted/5">
                <div className="space-y-4 pr-1.5 flex flex-col">
                  {messages.map((msg, i) => {
                    const cleaned = cleanMessageForChat(msg.content);
                    if (msg.role === "user") {
                      return (
                        <ChatMessage
                          key={i}
                          role="user"
                          content={msg.content}
                          className="max-w-[90%]"
                        />
                      );
                    }
                    return (
                      <ChatMessage key={i} role="assistant" className="max-w-[90%]">
                        {cleaned ? (
                          <GeneratedMarkdown content={cleaned} />
                        ) : (
                          <span className="text-muted-foreground italic text-xs">
                            Skill package generated. See files in the preview pane.
                          </span>
                        )}
                      </ChatMessage>
                    );
                  })}
                  {streaming && streamingContent && (
                    <ChatMessage role="assistant" className="max-w-[90%]">
                      {(() => {
                        const cleaned = cleanMessageForChat(streamingContent);
                        return cleaned ? (
                          <GeneratedMarkdown content={cleaned} streaming />
                        ) : (
                          <span className="text-muted-foreground italic text-xs animate-pulse">
                            Writing files...
                          </span>
                        );
                      })()}
                    </ChatMessage>
                  )}
                  {streaming && !streamingContent && (
                    <div className="flex items-center gap-2 p-3 bg-muted/20 border border-border/30 rounded-xl self-start max-w-[85%]">
                      <PhysicsGridSpinner profile="thinking" size={16} />
                      <span className="text-xs text-muted-foreground animate-pulse">Thinking...</span>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Refinement input */}
              <div className="p-3 border-t border-border/50 bg-muted/10 flex gap-2 items-center">
                <input
                  type="text"
                  placeholder={streaming ? "Waiting for AI..." : "Request changes or refine..."}
                  value={refinement}
                  onChange={(e) => setRefinement(e.target.value)}
                  disabled={streaming}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !streaming) {
                      handleRefine();
                    }
                  }}
                  className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-indigo-500/50 disabled:opacity-50"
                />
                <Button
                  size="icon-sm"
                  disabled={streaming || !refinement.trim()}
                  onClick={handleRefine}
                  className="h-9 w-9 cursor-pointer"
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </div>

            {/* Skill Workspace/Preview column */}
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/50 bg-card overflow-hidden shadow-sm">
              <div className="border-b border-border/50 px-4 py-2 bg-muted/20 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Check className="size-3.5 text-indigo-400" />
                  Skill Workspace
                </span>
                {metaError ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive border border-destructive/20">
                    <AlertTriangle className="size-3" /> Invalid frontmatter
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500 border border-emerald-500/20">
                    <Check className="size-3" /> Ready
                  </span>
                )}
              </div>

              {/* metadata banner */}
              <div className="px-4 py-2.5 bg-muted/10 border-b border-border/30 text-xs text-muted-foreground flex items-center min-h-[36px]">
                {metaError ? (
                  <p className="text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="size-3.5" />
                    {metaError}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-x-6 gap-y-1 w-full">
                    <div>
                      <span className="font-semibold text-foreground/70">Name:</span>{" "}
                      <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-indigo-400">
                        {fm.name}
                      </code>
                    </div>
                    <div className="truncate flex-1">
                      <span className="font-semibold text-foreground/70">Description:</span>{" "}
                      {fm.description}
                    </div>
                  </div>
                )}
              </div>

              {/* Workspace layout */}
              <div className="flex flex-1 overflow-hidden min-h-0">
                {/* file tabs list */}
                <div className="w-44 border-r border-border/50 bg-muted/5 flex flex-col shrink-0">
                  <div className="px-2.5 py-1.5 border-b border-border/50 bg-muted/10 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    Files
                  </div>
                  <ScrollArea className="min-h-0 flex-1 p-1">
                    <div className="space-y-1">
                      {/* SKILL.md */}
                      <button
                        onClick={() => setSelectedFile("SKILL.md")}
                        className={cn(
                          "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-all cursor-pointer",
                          selectedFile === "SKILL.md"
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                        )}
                      >
                        <FileText className="size-3.5 text-chart-4" />
                        <span className="truncate font-mono">SKILL.md</span>
                      </button>

                      {/* reference files */}
                      {localFiles.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => setSelectedFile(file.path)}
                          className={cn(
                            "w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-all cursor-pointer",
                            selectedFile === file.path
                              ? "bg-muted font-medium text-foreground"
                              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                          )}
                        >
                          <FileText className="size-3.5 text-muted-foreground/50" />
                          <span className="truncate font-mono" title={file.path}>
                            {file.path}
                          </span>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                {/* editor code text area */}
                <div className="flex-1 min-h-0 flex flex-col bg-card overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-border/30 bg-muted/10 text-[10px] font-mono text-muted-foreground/80 flex items-center justify-between select-none">
                    <span>{selectedFile}</span>
                    <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded text-foreground/40 uppercase tracking-wide">
                      Editable
                    </span>
                  </div>
                  <Textarea
                    value={currentContent}
                    onChange={(e) => setCurrentContent(e.target.value)}
                    disabled={streaming}
                    className="flex-1 resize-none rounded-none border-0 bg-transparent p-4 font-mono text-xs focus-visible:ring-0 leading-relaxed outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-border/30 pt-3 flex flex-row justify-between items-center">
          <div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartOver}
                disabled={streaming}
                className="cursor-pointer text-muted-foreground hover:text-foreground gap-1.5 rounded-lg"
              >
                <RotateCw className="size-3.5" />
                Start Over
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={streaming || saving}
              onClick={() => onOpenChange(false)}
              className="cursor-pointer rounded-lg"
            >
              Cancel
            </Button>
            {messages.length > 0 && (
              <Button
                onClick={handleSave}
                disabled={streaming || saving || !!metaError}
                className="cursor-pointer gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {saving ? "Saving..." : "Create Skill"}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
