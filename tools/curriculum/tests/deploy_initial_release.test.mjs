import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { releaseInputs, verifyInitialReleaseAudio } from "../deploy_initial_release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("initial release combines all canonical lexical and comprehension content", () => {
  const release = releaseInputs(ROOT);
  assert.equal(release.lexicalItems, 790);
  assert.equal(release.examples, 2201);
  assert.equal(release.resources, 26);
  assert.equal(release.questions, 56);
  assert.equal(release.listeningIds.length, 13);
  assert.equal(release.merged.comprehension_resources.filter((item) => item.skill === "reading").length, 13);
});

test("Listening assets must match the release hash, include every script and pass MP3 SHA-256 checks", async () => {
  const release = releaseInputs(ROOT);
  const directory = mkdtempSync(path.join(os.tmpdir(), "devfluency-release-audio-"));
  try {
    const audio = Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0010", "binary");
    const assets = release.listeningIds.map((resourceId, index) => {
      const assetFile = "listening-" + String(index + 1).padStart(2, "0") + ".mp3";
      const sourceResource = release.merged.comprehension_resources.find((resource) => resource.id === resourceId);
      writeFileSync(path.join(directory, assetFile), audio);
      return {
        resource_id: resourceId,
        asset_file: assetFile,
        audio_sha256: hash(audio),
        source_text_sha256: hash(Buffer.from(sourceResource.content, "utf8")),
        provider: "cloudflare",
        model: "@cf/deepgram/aura-2-en",
        voice: "Matthew",
        status: "generated_pending_audio_review",
      };
    });
    writeFileSync(path.join(directory, "listening-audio-manifest.v1.json"), JSON.stringify({
      format: "devfluency.listening-audio-manifest",
      schema_version: 1,
      source_catalog_sha256: release.catalogSha256,
      generated_at: "2026-11-19T00:00:00.000Z",
      provider: "cloudflare",
      voice: "Matthew",
      assets,
    }));

    const verified = await verifyInitialReleaseAudio(directory, release);
    assert.equal(verified.size, 13);
    assert.equal(verified.get(release.listeningIds[0]).audio_review.status, "automated_integrity_verified");
    assert.match(verified.get(release.listeningIds[0]).asset_url, /^\/audio\/listening\/listening-01\.mp3$/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Listening asset manifest rejects a different catalogue hash", async () => {
  const release = releaseInputs(ROOT);
  const directory = mkdtempSync(path.join(os.tmpdir(), "devfluency-release-audio-invalid-"));
  try {
    writeFileSync(path.join(directory, "listening-audio-manifest.v1.json"), JSON.stringify({
      format: "devfluency.listening-audio-manifest",
      schema_version: 1,
      source_catalog_sha256: "0".repeat(64),
      assets: [],
    }));
    await assert.rejects(
      verifyInitialReleaseAudio(directory, release),
      /no corresponden al hash/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
