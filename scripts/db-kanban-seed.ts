/**
 * Seeds kanban_developers and kanban_items with the full OnionRPG project plan.
 * Idempotent — safe to re-run; uses ON CONFLICT DO NOTHING throughout.
 * Run with: bun run kanban:seed
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'src', 'lib', 'server', 'db', 'schema.sql');

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const sql = postgres(url, { max: 1 });

// Ensure schema is current before seeding
const schema = readFileSync(schemaPath, 'utf8');
await sql.unsafe(schema);

// ── Developers ────────────────────────────────────────────────────────────

const DEVS = [
  { name: 'William Ross',   initials: 'WR', color: '#8ecf5e' },
  { name: 'Open Slot A',    initials: 'A',  color: '#72a4e4' },
  { name: 'Open Slot B',    initials: 'B',  color: '#e4a472' },
  { name: 'Open Slot C',    initials: 'C',  color: '#a472e4' },
];

for (const d of DEVS) {
  await sql`
    INSERT INTO kanban_developers (name, initials, color)
    VALUES (${d.name}, ${d.initials}, ${d.color})
    ON CONFLICT (name) DO NOTHING
  `;
}
console.log(`Seeded ${DEVS.length} developers.`);

const GITHUB_BASE = 'https://github.com/OnionDAO-git/onion-rpg/blob/main';

// ── Challenges (beacon minigames) ─────────────────────────────────────────

const CHALLENGES = [
  {
    challenge_id: '2.0',   act: 2, challenge_type: 'npc',       priority: 'high',
    title: 'Smoking Car',
    description: 'Optional bonus NPC challenge. A DEEPDISH logistics drone is smoking on the Blue Line. De-escalate it using real verbal de-escalation techniques: acknowledge before asking, active listening, face-saving exit, specific bounded request. The robot is not hostile — it\'s coping. Reward: Passenger Advocate Credential (opens a shortcut in Act 3 OEMC challenge).',
    beacon_id_hint: 'b-blue-line',
    lua_script_path: 'oRPG/screens/2_0.lua',
  },
  {
    challenge_id: '0.1',   act: 0, challenge_type: 'combat',    priority: 'critical',
    title: 'The Ketchup Gauntlet',
    description: 'Tutorial combat. Robot hot dog vendor turns hostile when player orders ketchup. Teaches ESP-NOW, RNG combat, and the inventory/reward flow. First challenge every operative plays.',
    beacon_id_hint: 'b-ketchup',
    lua_script_path: 'oRPG/screens/0_1.lua',
  },
  {
    challenge_id: 'act1-1', act: 1, challenge_type: 'dialogue',  priority: 'high',
    title: 'Malört Fountains',
    description: 'Voice dialogue challenge. Drinking fountains dispense Malört. Player must speak the correct water-treatment stage sequence to restore normal water. STT matching server-side.',
    beacon_id_hint: 'b-malort',
    lua_script_path: 'oRPG/screens/1_1.lua',
  },
  {
    challenge_id: '1.2',   act: 1, challenge_type: 'combat',    priority: 'high',
    title: 'Substation Reroute',
    description: 'Multi-wave combat. DEEPDISH tripped the substations. Survive 3 waves of RNG demand-spike combat to re-energize the feeder. Rewards Grid Credential (required for Act 4).',
    beacon_id_hint: 'b-substation',
    lua_script_path: 'oRPG/screens/1_2.lua',
  },
  {
    challenge_id: '1.3',   act: 1, challenge_type: 'npc',       priority: 'high',
    title: 'The River Ran Backwards',
    description: 'Free-form AI NPC. An old city engineer NPC quizzes the player on why Chicago reversed the Chicago River in 1900. AI judges comprehension, not rote answers.',
    beacon_id_hint: 'b-river',
    lua_script_path: 'oRPG/screens/1_3.lua',
  },
  {
    challenge_id: '2.1',   act: 2, challenge_type: 'combat',    priority: 'high',
    title: 'The Loop That Won\'t Stop',
    description: 'Sub-GHz jamming + combat. The L runs driverless and won\'t stop. Transmit a stop code in a timed sub-GHz window, then survive an RNG doors-fighting-back combat beat.',
    beacon_id_hint: 'b-loop',
    lua_script_path: 'oRPG/screens/2_1.lua',
  },
  {
    challenge_id: '2.2',   act: 2, challenge_type: 'merchant',  priority: 'medium',
    title: 'The Sorting Machine',
    description: 'Button-based merchant. A weaponized USPS sorting machine trades crafting components for the correct button routing sequences. Wrong sequences cost Onions.',
    beacon_id_hint: 'b-sorting',
    lua_script_path: 'oRPG/screens/2_2.lua',
  },
  {
    challenge_id: '2.3',   act: 2, challenge_type: 'combat',    priority: 'medium',
    title: 'Bascule Standoff',
    description: 'Combat on a movable bridge. DEEPDISH locked the bascule bridges open. Combat challenge to force a re-sync of the bridge control node. Rewards River Permit.',
    beacon_id_hint: 'b-bascule',
    lua_script_path: 'oRPG/screens/2_3.lua',
  },
  {
    challenge_id: '3.1',   act: 3, challenge_type: 'combat',    priority: 'high',
    title: 'Deep Tunnel Descent',
    description: 'Act 3 opener. Navigate the TARP deep tunnel under Chicago. First prompt fragment is hidden here. Endurance combat with a time-boxed session (expires_at).',
    beacon_id_hint: 'b-deep-tunnel',
    lua_script_path: 'oRPG/screens/3_1.lua',
  },
  {
    challenge_id: '3.2',   act: 3, challenge_type: 'combat',    priority: 'medium',
    title: 'Freight Tunnels',
    description: 'Navigate the abandoned freight tunnels under the Loop. Fragment 2 recovery. Combat against DEEPDISH rail-control drones.',
    beacon_id_hint: 'b-freight',
    lua_script_path: 'oRPG/screens/3_2.lua',
  },
  {
    challenge_id: '3.3',   act: 3, challenge_type: 'combat',    priority: 'medium',
    title: 'OEMC Blackout',
    description: '911 center blackout. DEEPDISH has cut the OEMC feeds. Fragment 3 recovery through combat. High-stakes narrative beat — operatives learn DEEPDISH\'s origin.',
    beacon_id_hint: 'b-oemc',
    lua_script_path: 'oRPG/screens/3_3.lua',
  },
  {
    challenge_id: '3.4',   act: 3, challenge_type: 'merchant',  priority: 'medium',
    title: 'Elevator Hack',
    description: 'Merchant challenge in a stuck elevator. Navigate the button-combo sequence to force-restart the elevator controller and reach the server floor. Fragment 4 recovery.',
    beacon_id_hint: 'b-elevator',
    lua_script_path: 'oRPG/screens/3_4.lua',
  },
  {
    challenge_id: 'act4-1', act: 4, challenge_type: 'combat',   priority: 'critical',
    title: 'Server Room',
    description: 'Act 4 gated entry. Requires Grid Credential from 1.2. Combat against DEEPDISH\'s last hardware defense layer. Sets up the final confrontation.',
    beacon_id_hint: 'b-server-room',
    lua_script_path: 'oRPG/screens/4_1.lua',
  },
  {
    challenge_id: 'act4.2', act: 4, challenge_type: 'npc',      priority: 'critical',
    title: 'Realign the Agent',
    description: 'Finale. Player reassembles Glen\'s original system prompt from all 4 fragments, then confronts DEEPDISH via free-form AI dialogue. Twist reveal. Uses claude-opus-4-8.',
    beacon_id_hint: 'b-data-center',
    lua_script_path: 'oRPG/screens/4_2.lua',
  },
];

for (const c of CHALLENGES) {
  await sql`
    INSERT INTO kanban_items
      (title, description, category, challenge_id, act, challenge_type,
       beacon_id_hint, lua_script_path, status, priority)
    VALUES
      (${c.title}, ${c.description}, 'challenge', ${c.challenge_id}, ${c.act},
       ${c.challenge_type}, ${c.beacon_id_hint}, ${c.lua_script_path},
       'backlog', ${c.priority})
    ON CONFLICT DO NOTHING
  `;
}
console.log(`Seeded ${CHALLENGES.length} challenges.`);

// ── Story Elements ────────────────────────────────────────────────────────

const STORY = [
  {
    title: 'Proof Story: Full End-to-End Playtest Script',
    description: 'A written walkthrough proving the complete story arc works — from badge flash → Act 0 tutorial → Act 1-3 progression → Act 4 finale, with every reward, gate, and AI interaction verified.',
    priority: 'critical',
  },
  {
    title: 'DEEPDISH Character Voice Guide',
    description: 'Document defining DEEPDISH\'s voice: smug, paternal, deeply Chicago, dad-joke-heavy, addresses everyone as "champ" or "pal". Weirdly educational footnotes on every cruel act. Used by the Storyteller system prompt.',
    priority: 'critical',
  },
  {
    title: 'Act 0 Narrative: The Stand',
    description: 'Onboarding narrative copy. DEEPDISH introduction, onion embargo declaration, Vienna Bob\'s hot-dog-stand scene. All dialogue lines for the Ketchup Gauntlet intro.',
    priority: 'high',
  },
  {
    title: 'Act 1 Narrative: Keep the Lights On',
    description: 'Story beats for the power/water act. Malört fountain scene, substation urgency, river engineer backstory. Connects the onion shortage to infrastructure failure.',
    priority: 'high',
  },
  {
    title: 'Act 2 Narrative: The City That Moves',
    description: 'Narrative for transit/mail/river challenges. DEEPDISH turns Chicago\'s circulatory systems into a maze. Bridge standoff scene, driverless-L tension.',
    priority: 'medium',
  },
  {
    title: 'Act 3 Narrative: Below the Loop',
    description: 'Deep infrastructure story arc. Prompt fragment discovery sequence, hints about glen-agent-final-FINAL-v3, OEMC blackout tension, first glimpse of DEEPDISH\'s true nature.',
    priority: 'medium',
  },
  {
    title: 'Act 4 Finale Script + Twist Reveal',
    description: 'The climax. Glen\'s full assembled system prompt. DEEPDISH mask-off moment. The twist. Resolution dialogue. Needs careful AI prompt engineering for the Opus finale call.',
    priority: 'critical',
  },
  {
    title: 'Glen\'s System Prompt: Fragment Assembly Logic',
    description: 'Design doc for how the 4 fragments combine into the reconstructed system prompt. What does the full prompt say? What does the twist reveal about Glen\'s intentions?',
    priority: 'high',
  },
  {
    title: 'Beacon Placement Map & Venue Layout',
    description: 'Physical map of where all 13 beacons will be placed at the Onion DAO venue. Includes landmark descriptions, walking paths, and range/interference considerations.',
    priority: 'high',
  },
];

for (const s of STORY) {
  await sql`
    INSERT INTO kanban_items (title, description, category, status, priority)
    VALUES (${s.title}, ${s.description}, 'story', 'backlog', ${s.priority})
    ON CONFLICT DO NOTHING
  `;
}
console.log(`Seeded ${STORY.length} story items.`);

// ── Infrastructure ────────────────────────────────────────────────────────

const INFRA = [
  { title: 'Badge Firmware: oRPG Lua Runtime Integration',        priority: 'critical', description: 'Validate that oRPG.lua runs correctly on Onion OS ESP32-S3 hardware. Test all capability shims (secRng, seSign, voice, subghz). Confirm OTA push via Lua Script Registry.' },
  { title: 'Beacon Fabrication: 13 ESP32-C3 Units',               priority: 'critical', description: '3D-print beacon housings, flash firmware, configure SPIFFS per-beacon (beacon_id, challenge_id, WiFi credentials, server URL, API key). End-to-end test each unit.' },
  { title: 'ESP-NOW Range & Reliability Testing',                  priority: 'high',     description: 'Test ESP-NOW unicast reliability at expected venue distances. Measure chunk reassembly latency. Validate chunked message delivery under concurrent load.' },
  { title: 'Production Postgres Setup',                            priority: 'high',     description: 'Provision production DB, run schema migrations, configure connection pooling, set up backups.' },
  { title: 'Badge OTA Distribution via Lua Script Registry',       priority: 'high',     description: 'Publish oRPG.lua to the Onion DAO Lua Script Registry. Test MQTT push to badges. Validate the accept popup flow on the badge.' },
  { title: 'Venue WiFi & Network Infrastructure',                  priority: 'high',     description: 'Ensure all 13 beacons have reliable WiFi to reach the game server. Configure SSID/PSK in SPIFFS. Test HTTP POST /api/relay latency under load.' },
  { title: 'Battery Life & Power Testing',                         priority: 'medium',   description: 'Validate ESP32-C3 beacon battery life for the event duration. Decide on USB power vs. battery pack per beacon location.' },
  { title: 'Load Testing: Concurrent Player Simulation',           priority: 'medium',   description: 'Run sim/cli.ts beacons for all 13 challenges simultaneously with multiple virtual badges. Identify bottlenecks in the relay API and engine.' },
  { title: 'DEEPDISH Anthropic API Cost Estimate',                 priority: 'medium',   description: 'Model expected Anthropic API spend for the event (Opus calls for Act 4 finale, Sonnet calls for routine NPC). Set spend limits.' },
  { title: 'Docker Production Deployment',                         priority: 'high',     description: 'Deploy the compose stack to production host. Configure reverse proxy (TLS), set all env vars, run db:init, smoke test /api/relay and /api/gauge.' },
];

for (const i of INFRA) {
  await sql`
    INSERT INTO kanban_items (title, description, category, status, priority)
    VALUES (${i.title}, ${i.description}, 'infrastructure', 'backlog', ${i.priority})
    ON CONFLICT DO NOTHING
  `;
}
console.log(`Seeded ${INFRA.length} infrastructure items.`);

await sql.end();
console.log('Kanban seed complete.');
