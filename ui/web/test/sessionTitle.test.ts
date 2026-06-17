import test from "node:test";
import assert from "node:assert/strict";
import {
  NEW_SESSION_TITLE,
  getSessionDisplayTitle,
} from "../src/lib/session-title.ts";

test("getSessionDisplayTitle uses the Vietnamese default for new sessions", () => {
  assert.equal(getSessionDisplayTitle({ key: "chat-mqgdf4b2-8cg3" }), NEW_SESSION_TITLE);
  assert.equal(NEW_SESSION_TITLE, "Cuộc trò chuyện mới");
});

test("getSessionDisplayTitle prefers a generated title when present", () => {
  assert.equal(
    getSessionDisplayTitle({ key: "chat-mqgdf4b2-8cg3", title: "Tra cứu khoản vay" }),
    "Tra cứu khoản vay",
  );
});

test("getSessionDisplayTitle can read title metadata from older session payloads", () => {
  assert.equal(
    getSessionDisplayTitle({
      key: "chat-mqgdf4b2-8cg3",
      title: "",
      extra_meta: { title: "Tóm tắt giao dịch" },
    }),
    "Tóm tắt giao dịch",
  );
});
