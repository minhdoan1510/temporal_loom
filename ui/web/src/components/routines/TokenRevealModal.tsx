import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface TokenRevealModalProps {
  open: boolean;
  token: string;
  onClose: () => void;
}

export function TokenRevealModal({ open, token, onClose }: TokenRevealModalProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(token);
    toast.success("Token copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md border-border/50 bg-sidebar">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <KeyRound className="size-5 text-warning" />
            API Token Generated
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This token is shown <strong>only once</strong>. Store it securely.
          </p>
          <div className="relative">
            <Input value={token} readOnly className="bg-card font-mono text-xs pr-12" />
            <button
              onClick={handleCopy}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex size-8 items-center justify-center rounded-md hover:bg-muted cursor-pointer"
              title="Copy to clipboard"
            >
              <Copy className="size-4" />
            </button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="cursor-pointer">I've saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
