import { useEffect } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import { X } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import ProfileTab from "./tabs/ProfileTab";
import WorkspaceTab from "./tabs/WorkspaceTab";
import SkillsTab from "./tabs/SkillsTab";
import ContextFilesTab from "./tabs/ContextFilesTab";
import KnowledgeTab from "./tabs/KnowledgeTab";
import MCPServersTab from "./tabs/MCPServersTab";
import RolesTab from "./tabs/RolesTab";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS_CONFIG = [
  { value: "profile", label: "General", tabName: "*" },
  { value: "workspace", label: "Workspace", tabName: "workspace" },
  { value: "skills", label: "Skills", tabName: "skills" },
  { value: "context-files", label: "Context Files", tabName: "context-files" },
  { value: "knowledge", label: "Knowledge", tabName: "knowledge" },
  { value: "mcp-servers", label: "MCP Servers", tabName: "mcp" },
  { value: "roles", label: "Roles", tabName: "roles" },
];

export default function SettingsDialog({
  open,
  onOpenChange,
  activeTab,
  onTabChange,
}: SettingsDialogProps) {
  const hasTabAccess = useAuthStore((s) => s.hasTabAccess);
  
  const visibleTabs = TABS_CONFIG.filter(
    (tab) => tab.tabName === "*" || hasTabAccess(tab.tabName)
  );

  const isTabVisible = visibleTabs.some((t) => t.value === activeTab);
  useEffect(() => {
    if (open && !isTabVisible && visibleTabs.length > 0) {
      onTabChange(visibleTabs[0].value);
    }
  }, [open, activeTab, isTabVisible, visibleTabs, onTabChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* Backdrop overlay */}
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/35 backdrop-blur-xs transition-all duration-200" />
        
        <Dialog.Popup className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-50 w-full max-w-[85vw] md:max-w-4xl lg:max-w-5xl h-[80vh] rounded-2xl border border-border bg-background shadow-2xl transition-all outline-none duration-300 flex flex-col overflow-hidden">
            
            {/* Close trigger button */}
            <Dialog.Close className="absolute right-4 top-4 z-50 flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground cursor-pointer">
              <X className="size-4" />
            </Dialog.Close>

            {/* Main content body containing Tabs */}
            <Tabs.Root 
              value={activeTab} 
              onValueChange={onTabChange}
              className="flex flex-col flex-1 min-h-0 bg-background"
            >
              {/* Tab pill-based navigation at the top */}
              <div className="flex justify-center bg-secondary/15 py-2.5 shrink-0">
                <Tabs.List className="flex items-center gap-1 bg-sidebar p-1 rounded-full border border-sidebar-border/80 shadow-xs">
                  {visibleTabs.map((tab) => (
                    <Tabs.Tab 
                      key={tab.value}
                      value={tab.value}
                      className="flex items-center px-5 py-2 text-xs md:text-sm font-semibold rounded-full transition-all duration-200 cursor-pointer select-none outline-none text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 data-[active]:bg-primary data-[active]:text-primary-foreground data-[active]:hover:bg-primary data-[active]:shadow-xs"
                    >
                      <span>{tab.label}</span>
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </div>

              {/* Scrollable Tab panels */}
              <div className="flex-1 overflow-y-auto min-h-0">
                
                <Tabs.Panel value="profile" className="p-5 md:p-6 outline-none">
                  <ProfileTab />
                </Tabs.Panel>

                {hasTabAccess("workspace") && (
                  <Tabs.Panel value="workspace" className="p-5 md:p-6 outline-none">
                    <WorkspaceTab />
                  </Tabs.Panel>
                )}

                {hasTabAccess("skills") && (
                  <Tabs.Panel value="skills" className="p-5 md:p-6 outline-none">
                    <SkillsTab />
                  </Tabs.Panel>
                )}

                {/* Context Files Tab handles its own scroll container */}
                {hasTabAccess("context-files") && (
                  <Tabs.Panel value="context-files" className="p-5 md:p-6 outline-none h-full flex flex-col">
                    <ContextFilesTab />
                  </Tabs.Panel>
                )}

                {hasTabAccess("knowledge") && (
                  <Tabs.Panel value="knowledge" className="p-5 md:p-6 outline-none">
                    <KnowledgeTab />
                  </Tabs.Panel>
                )}

                {hasTabAccess("mcp") && (
                  <Tabs.Panel value="mcp-servers" className="p-5 md:p-6 outline-none">
                    <MCPServersTab />
                  </Tabs.Panel>
                )}

                {hasTabAccess("roles") && (
                  <Tabs.Panel value="roles" className="p-5 md:p-6 outline-none">
                    <RolesTab />
                  </Tabs.Panel>
                )}

              </div>
            </Tabs.Root>

          </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
