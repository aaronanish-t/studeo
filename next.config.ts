import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next writes CLAUDE.md and AGENTS.md into the repo root on every `next dev`
  // and re-adds them if you delete them. They describe the toolchain rather
  // than this project, so they're off.
  agentRules: false,
};

export default nextConfig;
