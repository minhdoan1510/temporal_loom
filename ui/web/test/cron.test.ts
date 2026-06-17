import test from "node:test";
import assert from "node:assert/strict";
import { cronDescription, scheduleDescription, scheduleRuleLabel, timezoneDescription } from "../src/lib/cron.ts";

test("cronDescription explains common schedules as run rules", () => {
  assert.equal(cronDescription("0 * * * *"), "Every hour at minute 00");
  assert.equal(cronDescription("0 9 * * *"), "Every day at 09:00");
  assert.equal(cronDescription("0 9 * * 1-5"), "Weekdays at 09:00");
  assert.equal(cronDescription("0 9 * * 0"), "Every week on Sunday at 09:00");
});

test("cronDescription explains date-based schedules without exposing cron syntax", () => {
  assert.equal(cronDescription("50 10 16 6 *"), "Once on 16/06 at 10:50");
  assert.equal(cronDescription("35 19 15 6 *"), "Once on 15/06 at 19:35");
});

test("cronDescription falls back for invalid or unsupported schedules", () => {
  assert.equal(cronDescription("123 * * * *"), "Custom schedule");
  assert.equal(cronDescription("not a cron"), "Custom schedule");
});

test("scheduleDescription appends a readable timezone", () => {
  assert.equal(timezoneDescription("Asia/Ho_Chi_Minh"), "Vietnam time");
  assert.equal(scheduleDescription("47 17 16 6 *", "Asia/Ho_Chi_Minh"), "Once on 16/06 at 17:47 · Vietnam time");
});

test("scheduleRuleLabel returns short trigger badges", () => {
  assert.equal(scheduleRuleLabel("0 * * * *"), "Hourly");
  assert.equal(scheduleRuleLabel("0 9 * * *"), "Daily");
  assert.equal(scheduleRuleLabel("0 9 * * 1-5"), "Weekdays");
  assert.equal(scheduleRuleLabel("0 9 * * 0"), "Weekly");
  assert.equal(scheduleRuleLabel("47 17 16 6 *"), "Once");
  assert.equal(scheduleRuleLabel("not a cron"), "Custom");
});
