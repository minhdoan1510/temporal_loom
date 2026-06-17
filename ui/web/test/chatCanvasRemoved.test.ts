import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("chat canvas feature is removed", () => {
  const app = read("src/App.tsx");
  const layout = read("src/components/layout/AppLayout.tsx");
  const sessionsStore = read("src/stores/sessions.ts");
  const agentHandler = read("../../internal/transport/http/handler/agent.go");
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
  };

  assert.doesNotMatch(app, /CanvasDetailPage|path="canvas\/:key"/);
  assert.doesNotMatch(layout, /Canvas Chat|New Canvas|\/canvas\//);
  assert.doesNotMatch(sessionsStore, /canvasSessions|list\("canvas"\)/);
  assert.doesNotMatch(agentHandler, /canvas/);
  assert.equal(pkg.dependencies?.["@xyflow/react"], undefined);

  [
    "../../migrations/000025_add_canvas_session_kind.up.sql",
    "../../migrations/000025_add_canvas_session_kind.down.sql",
    "src/pages/CanvasDetailPage.tsx",
    "src/stores/canvasChat.ts",
    "src/stores/canvasBranching.ts",
    "test/canvasBranching.test.ts",
  ].forEach((path) => {
    assert.equal(existsSync(join(root, path)), false, `${path} should be removed`);
  });
});
