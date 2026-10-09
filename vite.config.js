import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vite';
import agentRolesPlugin from './tools/vite-plugin-agent-roles.js';
import officeFeedPlugin from './tools/vite-plugin-office-feed.js';
import skillsPlugin from './tools/vite-plugin-skills.js';

const skillsDir = path.join(os.homedir(), '.claude', 'skills');

export default defineConfig({
  // A fixed IPv4 address: Claude Code hooks post here, and skipping the `localhost` lookup keeps each hook call fast.
  server: { host: '127.0.0.1', port: 5173, strictPort: true, cors: false },
  plugins: [
    officeFeedPlugin(),
    agentRolesPlugin({ dir: path.join(os.homedir(), '.claude', 'agents') }),
    skillsPlugin({
      sources: [
        { label: 'Personal', dir: skillsDir, depth: 1 },
        { label: 'Synced from claude.ai', dir: path.join(skillsDir, 'synced'), depth: 2 },
      ],
    }),
  ],
});
