/*
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Provider {
  id: string;
  name: string;
  badge?: string;
  description?: string;
  icon?: string;
  isPopular?: boolean;
}

const ALL_PROVIDERS: Provider[] = [
  {
    id: "github-copilot",
    name: "GitHub Copilot",
    badge: "Custom",
    description: "Use your GitHub Copilot subscription.",
    isPopular: false,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    badge: "API key",
    description: "Access any open-source or commercial model via OpenRouter API.",
    isPopular: false,
  },
  {
    id: "opencode-zen",
    name: "OpenCode Zen",
    badge: "Recommended",
    description: "Curated models including Claude, GPT, Gemini and more",
    isPopular: true,
  },
  {
    id: "opencode-go",
    name: "OpenCode Go",
    badge: "Recommended",
    description: "Low cost subscription for everyone",
    isPopular: true,
  },
  {
    id: "opencode",
    name: "OpenCode Local",
    badge: "Local server",
    description: "Connect to your local OpenCode agent server programmatically",
    isPopular: true,
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex / GPT",
    badge: "API key",
    description: "Access OpenAI code generation models and legacy Codex endpoints",
    isPopular: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Direct access to Claude models, including Pro and Max",
    isPopular: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models for fast, capable general AI tasks",
    isPopular: true,
  },
];

export function OriginalProvidersTab() {
  const [connectedIds, setConnectedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem("connected-providers");
    return saved ? JSON.parse(saved) : ["github-copilot", "openrouter"];
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    localStorage.setItem("connected-providers", JSON.stringify(connectedIds));
  }, [connectedIds]);

  const handleConnectClick = (provider: Provider) => {
    setSelectedProvider(provider);
    setApiKey("");
    setDialogOpen(true);
  };

  const confirmConnect = () => {
    if (!selectedProvider) return;
    if (selectedProvider.badge === "API key" && !apiKey.trim()) {
      toast.error("API key is required");
      return;
    }
    
    setConnectedIds((prev) => [...prev, selectedProvider.id]);
    toast.success(`Successfully connected to ${selectedProvider.name}`);
    setDialogOpen(false);
    setSelectedProvider(null);
  };

  const handleDisconnect = (id: string, name: string) => {
    if (confirm(`Are you sure you want to disconnect from ${name}?`)) {
      setConnectedIds((prev) => prev.filter((item) => item !== id));
      toast.success(`Disconnected from ${name}`);
    }
  };

  const connectedProviders = ALL_PROVIDERS.filter((p) => connectedIds.includes(p.id));
  const popularProviders = ALL_PROVIDERS.filter((p) => !connectedIds.includes(p.id));

  // Helper component to render provider icons locally
  const ProviderIcon = ({ id }: { id: string }) => {
    switch (id) {
      case "github-copilot":
        return (
          <svg className="size-5 text-neutral-800" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
          </svg>
        );
      case "openrouter":
        return (
          <svg className="size-5 text-neutral-800" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
            <path d="M9 18c-4.51 2-5-2-7-2" />
          </svg>
        );
      case "opencode-zen":
        return (
          <div className="flex size-5 items-center justify-center bg-black rounded text-[11px] font-black text-white font-mono">
            Z
          </div>
        );
      case "opencode-go":
        return (
          <div className="flex size-5 items-center justify-center bg-black rounded text-[11px] font-black text-white font-mono">
            G
          </div>
        );
      case "opencode":
        return (
          <div className="flex size-5 items-center justify-center bg-blue-600 rounded text-[11px] font-black text-white font-mono shadow-xs">
            OC
          </div>
        );
      case "openai-codex":
        return (
          <div className="flex size-5 items-center justify-center bg-emerald-600 rounded text-[11px] font-black text-white font-mono shadow-xs">
            CX
          </div>
        );
      case "anthropic":
        return (
          <div className="flex size-5 items-center justify-center rounded font-sans font-bold text-neutral-800 text-sm">
            AI
          </div>
        );
      case "openai":
        return (
          <svg className="size-5 text-neutral-800" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/ * Title * /}
      <div>
        <h2 className="font-heading text-xl font-semibold sm:text-2xl">Providers</h2>
      </div>

      {/ * Connected Providers * /}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-neutral-800">Connected providers</h3>
        {connectedProviders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">
            No providers connected.
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-200 bg-[#fbfbfb] divide-y divide-neutral-200/60 overflow-hidden">
            {connectedProviders.map((provider) => (
              <div
                key={provider.id}
                className="flex items-center justify-between px-4 py-4 hover:bg-neutral-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-white border border-neutral-200/80 shadow-xs">
                    <ProviderIcon id={provider.id} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900 text-sm">{provider.name}</span>
                    {provider.badge && (
                      <Badge variant="outline" className="text-[10px] font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200 py-0.5 px-1.5 leading-none h-auto">
                        {provider.badge}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="text-neutral-950 hover:bg-neutral-100 text-sm font-medium h-9 px-3 rounded-lg border border-neutral-200"
                  onClick={() => handleDisconnect(provider.id, provider.name)}
                >
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/ * Popular Providers * /}
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-semibold text-neutral-800">Popular providers</h3>
        <div className="rounded-xl border border-neutral-200 bg-white divide-y divide-neutral-200/60 overflow-hidden shadow-xs">
          {popularProviders.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between px-4 py-4 hover:bg-neutral-50/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-neutral-50 border border-neutral-200/50">
                  <ProviderIcon id={provider.id} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-950 text-sm">{provider.name}</span>
                    {provider.badge && (
                      <Badge variant="outline" className="text-[10px] font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200 py-0.5 px-1.5 leading-none h-auto">
                        {provider.badge}
                      </Badge>
                    )}
                  </div>
                  {provider.description && (
                    <p className="text-xs text-neutral-400 mt-0.5">{provider.description}</p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                className="text-neutral-950 border border-neutral-200 bg-white hover:bg-neutral-50 h-9 px-4 rounded-lg font-medium text-sm flex items-center gap-1 shrink-0"
                onClick={() => handleConnectClick(provider)}
              >
                <span className="text-neutral-400 font-light mr-0.5">+</span> Connect
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/ * Connection Dialog * /}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect to {selectedProvider?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-neutral-500">
              {selectedProvider?.badge === "API key" 
                ? `Please enter your ${selectedProvider.name} API key to configure this provider.`
                : `Would you like to connect ${selectedProvider?.name}?`
              }
            </p>
            {selectedProvider?.badge === "API key" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-neutral-600">API Key</label>
                <Input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="rounded-lg border-neutral-200 shadow-xs"
                />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setSelectedProvider(null);
              }}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button onClick={confirmConnect} className="rounded-lg">
              Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
*/

export default function ProvidersTab() {
  return null;
}

