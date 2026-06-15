import { useState, useMemo } from "react";
import {
  Play,
  Sparkles,
  Code,
  Cpu,
  Terminal,
  FileJson,
  Layers,
  Check,
  Copy,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { generateText, streamText, generateObject, streamObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

// Schema for generating a recipe (used as a demo for generateObject and streamObject)
const recipeSchema = z.object({
  recipe: z.object({
    name: z.string(),
    description: z.string(),
    prepTime: z.string(),
    cookTime: z.string(),
    ingredients: z.array(z.string()),
    steps: z.array(z.string()),
  }),
});

// Schema for generating a team roster
const teamRosterSchema = z.object({
  teamName: z.string(),
  department: z.string(),
  members: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      skills: z.array(z.string()),
    })
  ),
});

type PlaygroundMethod = "generateText" | "streamText" | "generateObject" | "streamObject";

export default function AiSdkPlaygroundPage() {
  const [method, setMethod] = useState<PlaygroundMethod>("streamText");
  const [model, setModel] = useState("gemini/gemini-3.1-pro-preview");
  const [prompt, setPrompt] = useState("Write a short, engaging description of Vercel AI SDK.");
  const [temperature, setTemperature] = useState(0.7);
  const [schemaType, setSchemaType] = useState<"recipe" | "team">("recipe");

  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"result" | "code">("result");
  const [copied, setCopied] = useState(false);
  
  // Stats
  const [elapsedTime, setElapsedTime] = useState<number | null>(null);

  const customOpenAI = useMemo(() => {
    return createOpenAI({
      baseURL: "/api/v1/ai-sdk/proxy",
      apiKey: "dummy-key",
    });
  }, []);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    toast.success("Code copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const codeSnippet = useMemo(() => {
    const selectedSchema = schemaType === "recipe" ? "recipeSchema" : "teamRosterSchema";
    const schemaImport = `import { z } from "zod";

const recipeSchema = z.object({
  recipe: z.object({
    name: z.string(),
    description: z.string(),
    prepTime: z.string(),
    cookTime: z.string(),
    ingredients: z.array(z.string()),
    steps: z.array(z.string()),
  }),
});

const teamRosterSchema = z.object({
  teamName: z.string(),
  department: z.string(),
  members: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      skills: z.array(z.string()),
    })
  ),
});`;

    switch (method) {
      case "generateText":
        return `import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

// Using Vercel AI SDK Core to generate static text
const { text } = await generateText({
  model: openai("${model}"),
  temperature: ${temperature},
  prompt: "${prompt}",
});

console.log(text);`;

      case "streamText":
        return `import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

// Using Vercel AI SDK Core to stream text chunks in real-time
const { textStream } = await streamText({
  model: openai("${model}"),
  temperature: ${temperature},
  prompt: "${prompt}",
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}`;

      case "generateObject":
        return `${schemaImport}

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";

// Using Vercel AI SDK Core to generate structured data matching a Zod schema
const { object } = await generateObject({
  model: openai("${model}"),
  schema: ${selectedSchema},
  temperature: ${temperature},
  prompt: "${prompt}",
});

console.log(JSON.stringify(object, null, 2));`;

      case "streamObject":
        return `${schemaImport}

import { streamObject } from "ai";
import { openai } from "@ai-sdk/openai";

// Using Vercel AI SDK Core to stream structured elements matching a Zod schema
const { partialObjectStream } = await streamObject({
  model: openai("${model}"),
  schema: ${selectedSchema},
  temperature: ${temperature},
  prompt: "${prompt}",
});

for await (const partialObject of partialObjectStream) {
  console.clear();
  console.log(JSON.stringify(partialObject, null, 2));
}`;
    }
  }, [method, model, prompt, temperature, schemaType]);

  const handleRun = async () => {
    setLoading(true);
    setOutput("");
    setElapsedTime(null);
    setActiveTab("result");
    const startTime = Date.now();

    try {
      const activeModel = customOpenAI(model) as any;
      const activeSchema = schemaType === "recipe" ? recipeSchema : teamRosterSchema;

      if (method === "generateText") {
        const result = await generateText({
          model: activeModel,
          temperature,
          prompt,
        });
        setOutput(result.text);
      } else if (method === "streamText") {
        const result = await streamText({
          model: activeModel,
          temperature,
          prompt,
        });
        
        let accum = "";
        for await (const textPart of result.textStream) {
          accum += textPart;
          setOutput(accum);
        }
      } else if (method === "generateObject") {
        const result = await generateObject({
          model: activeModel,
          schema: activeSchema,
          temperature,
          prompt,
        });
        setOutput(JSON.stringify(result.object, null, 2));
      } else if (method === "streamObject") {
        const result = await streamObject({
          model: activeModel,
          schema: activeSchema,
          temperature,
          prompt,
        });

        for await (const partial of result.partialObjectStream) {
          setOutput(JSON.stringify(partial, null, 2));
        }
      }

      setElapsedTime(Math.round(Date.now() - startTime));
      toast.success("Execution completed successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Execution failed: " + (err instanceof Error ? err.message : String(err)));
      setOutput("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleApplyExample = (exPrompt: string, exMethod: PlaygroundMethod, exSchema?: "recipe" | "team") => {
    setPrompt(exPrompt);
    setMethod(exMethod);
    if (exSchema) {
      setSchemaType(exSchema);
    }
    toast.info("Example loaded into prompt!");
  };

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text font-heading text-2xl font-bold tracking-tight text-transparent">
            Vercel AI SDK Playground
          </h1>
          <p className="text-xs text-muted-foreground">
            Explore Unified LLM APIs (generateText, streamText, generateObject, streamObject) using our secure reverse proxy.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 border border-blue-100">
          <Cpu className="size-3.5" />
          <span>Powered by Vercel AI SDK v6</span>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        
        {/* Left Column: Controls (Spans 2 cols) */}
        <div className="lg:col-span-2 space-y-5">
          
          {/* Main Controls Card */}
          <div className="rounded-3xl bg-white p-6 shadow-xs border border-neutral-100 space-y-4">
            <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
              <Sparkles className="size-4.5 text-primary" />
              <h2 className="font-heading text-sm font-bold text-neutral-800">Configuration</h2>
            </div>

            {/* SDK Method Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                SDK Method
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "generateText", label: "Generate Text" },
                  { value: "streamText", label: "Stream Text" },
                  { value: "generateObject", label: "Generate Object" },
                  { value: "streamObject", label: "Stream Object" },
                ].map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setMethod(item.value as PlaygroundMethod)}
                    className={`flex items-center justify-center rounded-xl py-2.5 text-xs font-bold border transition cursor-pointer ${
                      method === item.value
                        ? "bg-primary border-primary text-white shadow-sm"
                        : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model Select */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Model Choice
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 outline-none focus:border-neutral-300"
              >
                <option value="gemini/gemini-3.1-pro-preview">Gemini 3.1 Pro (via LiteLLM)</option>
                <option value="gemini/gemini-3.5-flash-preview">Gemini 3.5 Flash (via LiteLLM)</option>
                <option value="openai/gpt-4o">GPT-4o (via LiteLLM)</option>
              </select>
            </div>

            {/* Prompt Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-800 outline-none focus:border-neutral-300 resize-none font-medium leading-relaxed"
                placeholder="Enter your prompt here..."
              />
            </div>

            {/* Structured Object Details */}
            {(method === "generateObject" || method === "streamObject") && (
              <div className="space-y-1.5 rounded-2xl bg-neutral-50 p-4 border border-neutral-100">
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-neutral-500">
                  <FileJson className="size-3.5 text-indigo-500" />
                  JSON Object Schema
                </span>
                <p className="text-[11px] text-muted-foreground mb-2">
                  Select a predefined Zod validation schema for the structured response.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSchemaType("recipe")}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold border transition cursor-pointer ${
                      schemaType === "recipe"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    Recipe Schema
                  </button>
                  <button
                    onClick={() => setSchemaType("team")}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold border transition cursor-pointer ${
                      schemaType === "team"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                        : "bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    Team Roster Schema
                  </button>
                </div>
              </div>
            )}

            {/* Temperature Slider */}
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider text-neutral-400">
                <span>Temperature</span>
                <span className="font-mono text-primary">{temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
            </div>

            {/* Run Button */}
            <button
              onClick={handleRun}
              disabled={loading || !prompt.trim()}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-white shadow-sm transition hover:bg-primary-hover disabled:bg-neutral-300 disabled:cursor-not-allowed"
            >
              <Play className={`size-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Streaming / Executing..." : "Run Playground"}
            </button>
          </div>

          {/* Quick Examples Card */}
          <div className="rounded-3xl bg-white p-6 shadow-xs border border-neutral-100">
            <div className="flex items-center gap-2 border-b border-neutral-100 pb-3 mb-3">
              <Layers className="size-4 text-neutral-500" />
              <h2 className="font-heading text-sm font-bold text-neutral-800">Quick Examples</h2>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => handleApplyExample("Write a four-line poem about coffee.", "streamText")}
                className="w-full text-left rounded-xl p-2.5 hover:bg-neutral-50 border border-neutral-100 text-xs font-semibold text-neutral-700 transition"
              >
                📝 Poem Writer (streamText)
              </button>
              <button
                onClick={() => handleApplyExample("Write a recipe for chocolate chip cookies.", "streamObject", "recipe")}
                className="w-full text-left rounded-xl p-2.5 hover:bg-neutral-50 border border-neutral-100 text-xs font-semibold text-neutral-700 transition"
              >
                🍳 Cookie Recipe (streamObject)
              </button>
              <button
                onClick={() => handleApplyExample("Create a software engineering team with 3 developers specializing in React & Go.", "generateObject", "team")}
                className="w-full text-left rounded-xl p-2.5 hover:bg-neutral-50 border border-neutral-100 text-xs font-semibold text-neutral-700 transition"
              >
                👥 Development Roster (generateObject)
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Code & Output (Spans 3 cols) */}
        <div className="lg:col-span-3 flex flex-col min-h-[500px]">
          {/* Card Wrapper */}
          <div className="flex-1 flex flex-col rounded-3xl bg-white p-6 shadow-xs border border-neutral-100">
            {/* Tabs */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-4 shrink-0">
              <div className="flex gap-1 bg-neutral-100/80 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab("result")}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
                    activeTab === "result"
                      ? "bg-white text-neutral-900 shadow-xs"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  <Terminal className="size-3.5" />
                  Live Output
                </button>
                <button
                  onClick={() => setActiveTab("code")}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
                    activeTab === "code"
                      ? "bg-white text-neutral-900 shadow-xs"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  <Code className="size-3.5" />
                  AI SDK Code
                </button>
              </div>

              {/* Copy Code button */}
              {activeTab === "code" && (
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:text-neutral-900 cursor-pointer shadow-xs transition hover:bg-neutral-50"
                >
                  {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  <span>{copied ? "Copied!" : "Copy Snippet"}</span>
                </button>
              )}

              {/* Execution Info */}
              {activeTab === "result" && elapsedTime !== null && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                  <Info className="size-3.5 text-neutral-400" />
                  <span>Time elapsed: <span className="font-mono font-bold text-neutral-600">{elapsedTime}ms</span></span>
                </div>
              )}
            </div>

            {/* Tab Panes */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0">
              {activeTab === "result" ? (
                <div className="flex-1 flex flex-col">
                  {output ? (
                    <pre
                      className={`flex-1 overflow-auto rounded-2xl bg-zinc-950 p-4 border border-zinc-900 font-mono text-xs leading-relaxed text-zinc-100 whitespace-pre-wrap select-text max-h-[500px] ${
                        loading ? "after:content-['|'] after:ml-0.5 after:text-primary after:animate-ping" : ""
                      }`}
                    >
                      {output}
                    </pre>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-neutral-200 rounded-2xl">
                      <Terminal className="size-8 text-neutral-300 animate-pulse mb-3" />
                      <p className="text-sm font-semibold text-neutral-600">No output generated yet</p>
                      <p className="text-xs text-neutral-400 mt-1 max-w-sm">
                        Configure options on the left and click "Run Playground" to execute Vercel AI SDK client code in real-time.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <pre className="flex-1 overflow-auto rounded-2xl bg-zinc-950 p-4 border border-zinc-900 font-mono text-xs leading-relaxed text-emerald-400 select-text max-h-[500px]">
                    {codeSnippet}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
