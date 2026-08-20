"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  effectiveMembershipStatus,
  isWithinRange,
  membershipIsActive,
  periodKey,
} = require("../server/membership/service");

const now = Date.parse("2026-07-10T00:00:00.000Z");

test("membership status reflects active, expired, canceled, paused and lifetime records", () => {
  const active = {
    status: "active",
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-01T00:00:00.000Z",
  };
  assert.equal(isWithinRange(active, now), true);
  assert.equal(membershipIsActive(active, now), true);
  assert.equal(effectiveMembershipStatus(active, now), "active");
  assert.equal(effectiveMembershipStatus({ ...active, endsAt: "2026-07-09T00:00:00.000Z" }, now), "expired");
  assert.equal(effectiveMembershipStatus({ ...active, status: "canceled" }, now), "canceled");
  assert.equal(effectiveMembershipStatus({ ...active, status: "paused" }, now), "paused");
  assert.equal(effectiveMembershipStatus({ status: "lifetime" }, now), "lifetime");
});

test("feature usage period keys are stable for daily, monthly and lifetime quotas", () => {
  const date = new Date("2026-07-10T12:34:56.000Z");
  assert.equal(periodKey("daily", date), "2026-07-10");
  assert.equal(periodKey("monthly", date), "2026-07");
  assert.equal(periodKey("lifetime", date), "lifetime");
});
