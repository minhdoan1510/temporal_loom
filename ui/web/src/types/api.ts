// Types matching Go JSON structs

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  description: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  /** Client-only UI theme preference (not persisted on the backend). */
  theme?: import("@/stores/theme").Theme;
}

export interface WorkspaceMember {
  workspace_id: string;
  user_sub: string;
  added_at: string;
}

export interface SessionInfo {
  key: string;
  title?: string;
  created_by?: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface MessageToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: MessageToolCall[];
  tool_call_id?: string;
}

export interface SessionData {
  key: string;
  title?: string;
  messages: Message[];
  summary: string;
  model: string;
  provider: string;
  channel: string;
  user_id: string;
  input_tokens: number;
  output_tokens: number;
  compaction_count: number;
  extra_meta?: Record<string, string>;
  created: string;
  updated: string;
}

export interface RunRequest {
  session_key: string;
  message: string;
  channel?: string;
  user_id?: string;
  stream?: boolean;
  kind?: string;
}

export interface RunResult {
  content: string;
  title?: string;
  runId: string;
  iterations: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface OpenAIChatCompletionRequest {
  messages: Message[];
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
}

export interface OpenAIChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIChatCompletionChunk {
  id?: string;
  object?: "chat.completion.chunk";
  created?: number;
  model?: string;
  choices?: Array<{
    index: number;
    delta?: {
      role?: "assistant";
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  error?: {
    message?: string;
    type?: string;
  };
}

export interface SkillFile {
  path: string;
  content: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  metadata: string;
  files?: SkillFile[];
  // Present on create/update responses: reference files skipped (scripts/binaries).
  skipped_files?: string[];
  created_at: string;
  updated_at: string;
}

export interface ContextFile {
  id: string;
  scope: "global" | "user";
  user_id: string | null;
  path: string;
  content: string;
  updated_at: string;
}

// SSE event types
export interface SSEEvent {
  type:
    | "run.started"
    | "chunk"
    | "tool.call"
    | "tool.result"
    | "run.completed"
    | "run.failed";
  agentId: string;
  runId: string;
  payload: Record<string, unknown>;
}

export interface ChunkPayload {
  content: string;
}

export interface ToolCallPayload {
  name: string;
  id: string;
}

export interface ToolResultPayload {
  name: string;
  id: string;
  is_error: boolean;
}

export interface RunCompletedPayload {
  content: string;
  title?: string;
  output_preview: string;
  input_tokens: number;
  output_tokens: number;
  iterations: number;
}

export interface RunFailedPayload {
  error: string;
}

export interface Role {
  name: string;
  permissions: string[];
  members: string[];
}

export interface MCPFunction {
  server_name: string;
  name: string;
  description: string;
  schema_json: Record<string, unknown>;
  enabled: boolean;
  updated_at: string;
}

export interface MCPServer {
  name: string;
  url: string;
  auth_type: "bearer" | "oauth" | string;
  enabled: boolean;
  description: string;
  has_auth: boolean;
  oauth_provider?: string;
  oauth_connected: boolean;
  oauth_expires_at?: string | null;
  last_synced: string | null;
  created_at: string;
  updated_at: string;
  functions: MCPFunction[];
  warning?: string;
}

export interface MCPOAuthStart {
  authorization_url: string;
}

export interface AllowedTool {
  name: string;
  permission_key: string;
  source: string; // "platform" or "mcp:<server>"
}

export interface UserProfile {
  user_id?: string;
  roles?: string[];
  permissions: string[] | null;
  allowed_tools: AllowedTool[];
}

export interface KnowledgeBase {
  id: string;
  name: string;
  collection: string;
  source: "confluence" | "markdown";
  space_key: string;
  root_page: string;
  content?: string;
  chunk_size: number;
  chunk_overlap: number;
  status: "idle" | "syncing" | "done" | "error";
  error_msg: string | null;
  total_pages: number;
  total_chunks: number;
  total_points: number;
  last_synced: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Routine {
  id: string;
  workspace_id: string;
  name: string;
  prompt: string;
  model?: string;
  session_prefix: string;
  enabled: boolean;
  schedule_cron?: string;
  schedule_tz: string;
  temporal_schedule_id?: string;
  has_fire_token: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface RoutineRun {
  id: string;
  routine_id: string;
  workspace_id: string;
  trigger_type: "schedule" | "api" | "manual";
  status: "running" | "success" | "failed";
  session_key?: string;
  workflow_id?: string;
  temporal_run_id?: string;
  input_text?: string;
  output_preview?: string;
  error?: string;
  input_tokens: number;
  output_tokens: number;
  iterations: number;
  started_at: string;
  finished_at?: string;
  duration_ms: number;
}

export interface CreateRoutineResp {
  routine: Routine;
  fire_token?: string;
}

export interface FireRunResp {
  workflow_id: string;
  run_id: string;
}
