import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isLocationEligible,
  isLocationRestricted,
  isRemoteJob,
  filterJobs,
  deduplicate,
  detectWorkplaceType,
} from "../lib/filters.js";

test("countries on your list are accepted, abbreviations included", () => {
  for (const place of [
    "Berlin, Germany",
    "Dubai, UAE",
    "UK",
    "Remote - USA",
    "Singapore",
    "Toronto, Canada",
    "Vancouver (BC), Canada",
    "Ontario, Canada",
    "Remote (Canada)",
    "Montreal, Quebec",
    "Calgary, Alberta",
  ]) {
    assert.equal(isLocationEligible(place).ok, true, place);
  }
});

test("countries below your pay floor are rejected", () => {
  for (const place of [
    "Lagos, Nigeria",
    "Mumbai, India",
    "Manila, Philippines",
  ]) {
    assert.equal(isLocationEligible(place).ok, false, place);
  }
});

test("remote and worldwide jobs are accepted, and so is a blank location", () => {
  for (const place of ["Remote", "Worldwide", "Remote, EMEA", "Anywhere", ""]) {
    assert.equal(isLocationEligible(place).ok, true, place || "(blank)");
  }
});

test("jobs tied to specific countries or regions are flagged, open ones are not", () => {
  for (const place of [
    "Remote - USA",
    "Remote, AMER",
    "Remote - Canada",
    "Remote - UK",
  ]) {
    assert.equal(isLocationRestricted(place), true, place);
  }
  for (const place of [
    "Remote",
    "Remote, EMEA",
    "Remote, Global",
    "Worldwide",
  ]) {
    assert.equal(isLocationRestricted(place), false, place);
  }
});

test("remote-only boards are always remote, even with just a country name", () => {
  assert.equal(
    isRemoteJob({
      source: "himalayas",
      location: "United States",
      title: "Dev",
    }),
    true,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "Berlin, Germany",
      title: "Dev",
      description: "",
    }),
    false,
  );
  assert.equal(
    isRemoteJob({
      source: "greenhouse",
      location: "",
      title: "Dev",
      description: "This is a fully remote role.",
    }),
    true,
  );
});

test("filterJobs drops ineligible countries and adds the restricted flag", () => {
  const out = filterJobs([
    { source: "ashby", title: "Dev", location: "Remote - USA" },
    { source: "ashby", title: "Dev", location: "Lagos, Nigeria" },
    { source: "ashby", title: "Dev", location: "Remote, EMEA" },
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].locationRestricted, true);
  assert.equal(out[1].locationRestricted, false);
});

test("deduplicate removes known links, repeats and jobs with no link", () => {
  const out = deduplicate(
    [{ link: "a" }, { link: "b" }, { link: "b" }, { link: "" }, { link: "c" }],
    new Set(["a"]),
  );
  assert.deepEqual(
    out.map((j) => j.link),
    ["b", "c"],
  );
});

test("detectWorkplaceType classifies remote, hybrid, and onsite correctly", () => {
  assert.equal(
    detectWorkplaceType({ source: "himalayas", location: "United States" }),
    "remote"
  );
  assert.equal(
    detectWorkplaceType({ source: "jobbank", location: "Vancouver (BC), Canada", tags: ["On-site"] }),
    "onsite"
  );
  assert.equal(
    detectWorkplaceType({ source: "jobbank", location: "Beamsville (ON), Canada (Hybrid)", tags: ["Hybrid"] }),
    "hybrid"
  );
  assert.equal(
    detectWorkplaceType({ source: "greenhouse", location: "New York, NY", description: "Office presence required 5 days a week" }),
    "onsite"
  );
  assert.equal(
    detectWorkplaceType({ source: "greenhouse", location: "London, UK", description: "Hybrid policy: 2 days in office" }),
    "hybrid"
  );
  assert.equal(
    detectWorkplaceType({ source: "greenhouse", location: "Berlin, Germany", description: "This is a fully remote position" }),
    "remote"
  );
});

