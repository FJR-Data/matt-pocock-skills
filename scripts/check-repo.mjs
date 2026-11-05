#!/usr/bin/env node
// Checks the repo invariants that CLAUDE.md states, so a PR can't merge
// while breaking one. Exits 1 and lists every failure.
//
// Per-skill checks cover the promoted buckets only: those are what the
// plugin ships, and upstream's in-progress/ work shouldn't turn a sync red.
//
//   node scripts/check-repo.mjs                  # whole-repo invariants
//   node scripts/check-repo.mjs --base origin/main
//     also rejects em-dashes on lines the branch adds since <base>
//     (CHANGELOG.md predates the rule, so only new lines are held to it)

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const fail = (msg) => failures.push(msg);
const read = (p) => readFileSync(join(repo, p), "utf8");

const PROMOTED = ["engineering", "productivity"];
const NON_PROMOTED = ["misc", "in-progress", "deprecated"];

// Every skill folder: skills/<bucket>/<name>/SKILL.md
const skills = [];
for (const bucket of readdirSync(join(repo, "skills"))) {
  const bucketDir = join(repo, "skills", bucket);
  if (!statSync(bucketDir).isDirectory()) continue;
  for (const name of readdirSync(bucketDir)) {
    if (existsSync(join(bucketDir, name, "SKILL.md"))) skills.push({ bucket, name });
  }
}
const promoted = skills.filter((s) => PROMOTED.includes(s.bucket));
const skillPath = (s) => `./skills/${s.bucket}/${s.name}`;

// 1. plugin.json ships exactly the promoted set.
const shipped = new Set(JSON.parse(read(".claude-plugin/plugin.json")).skills);
for (const s of promoted) {
  if (!shipped.has(skillPath(s))) fail(`plugin.json: missing promoted skill ${skillPath(s)}`);
}
const promotedPaths = new Set(promoted.map(skillPath));
for (const p of shipped) {
  if (!promotedPaths.has(p)) fail(`plugin.json: ships ${p}, which is not a promoted skill`);
}

// 2. README.md links every promoted SKILL.md and no non-promoted one.
const readme = read("README.md");
for (const s of promoted) {
  if (!readme.includes(`(${skillPath(s)}/SKILL.md)`)) fail(`README.md: no link to ${skillPath(s)}/SKILL.md`);
}
for (const s of skills.filter((s) => NON_PROMOTED.includes(s.bucket))) {
  if (readme.includes(`${skillPath(s)}/SKILL.md`)) fail(`README.md: links non-promoted ${skillPath(s)}/SKILL.md`);
}

// 3. Each promoted bucket README lists its skills, and each has a docs page.
for (const s of promoted) {
  const bucketReadme = `skills/${s.bucket}/README.md`;
  if (existsSync(join(repo, bucketReadme)) && !read(bucketReadme).includes(`(./${s.name}/SKILL.md)`)) {
    fail(`${bucketReadme}: no link to ./${s.name}/SKILL.md`);
  }
}
for (const s of promoted) {
  if (!existsSync(join(repo, "docs", s.bucket, `${s.name}.md`))) fail(`docs/${s.bucket}/${s.name}.md: missing docs page`);
}

// 4. Invocation agrees across harnesses: disable-model-invocation in
//    SKILL.md pairs with allow_implicit_invocation: false in openai.yaml.
for (const s of promoted) {
  const dir = `skills/${s.bucket}/${s.name}`;
  const userInvoked = /^disable-model-invocation:\s*true\s*$/m.test(read(`${dir}/SKILL.md`));
  const yamlPath = `${dir}/agents/openai.yaml`;
  if (!existsSync(join(repo, yamlPath))) {
    fail(`${yamlPath}: missing`);
    continue;
  }
  const implicitOff = /allow_implicit_invocation:\s*false/.test(read(yamlPath));
  if (userInvoked !== implicitOff) {
    fail(`${dir}: disable-model-invocation (${userInvoked}) disagrees with openai.yaml allow_implicit_invocation false (${implicitOff})`);
  }
}

// 5. Relative links inside promoted skills resolve.
const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".md") ? [p] : [];
  });
for (const file of promoted.flatMap((s) => walk(join(repo, "skills", s.bucket, s.name)))) {
  const text = readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split("#")[0]);
    if (!existsSync(resolve(dirname(file), path))) fail(`${relative(repo, file)}: broken link ${target}`);
  }
}

// 6. No em-dash on lines this branch adds.
const baseIndex = process.argv.indexOf("--base");
if (baseIndex !== -1) {
  const base = process.argv[baseIndex + 1];
  const diff = execFileSync("git", ["diff", "--unified=0", `${base}...HEAD`], { cwd: repo, encoding: "utf8" });
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) file = line.slice(6);
    else if (line.startsWith("+") && line.includes("\u2014")) fail(`${file}: em-dash on an added line: ${line.slice(1).trim()}`);
  }
}

if (failures.length) {
  console.error(`check-repo: ${failures.length} failure(s)\n` + failures.map((f) => `- ${f}`).join("\n"));
  process.exit(1);
}
console.log(`check-repo: ok (${skills.length} skills, ${promoted.length} promoted)`);
