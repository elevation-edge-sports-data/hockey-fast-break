/**
 * Kit 5 and kit 6 are inserted at ids 4 and 5.
 * The previous kits 5–8 keep their colors at ids 6–9.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const server = await createServer({
  configFile: false,
  root: repo,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
after(() => server.close());

const { UNIFORMS, kitName } = await server.ssrLoadModule("/src/game/uniforms.ts");

test("new kits sit at 5 and 6 and the old 5–8 shift up by two", () => {
  assert.equal(UNIFORMS.length, 10);
  assert.deepEqual(
    UNIFORMS.map((u) => u.id),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(kitName(4), "Kit 5");
  assert.equal(kitName(5), "Kit 6");
  assert.equal(kitName(6), "Kit 7");
  assert.equal(kitName(9), "Kit 10");

  assert.equal(UNIFORMS[0].jersey, "#5a1021");
  assert.equal(UNIFORMS[0].pantStripe, "#5a1021");
  assert.equal(UNIFORMS[0].stripe, "#236192");
  assert.equal(UNIFORMS[0].socks, "#5a1021");
  assert.equal(UNIFORMS[1].jersey, "#c49a3e");
  assert.equal(UNIFORMS[1].pantStripe, "#c49a3e");
  assert.equal(UNIFORMS[1].stripe, "#111111");
  assert.equal(UNIFORMS[1].armStripe, undefined);
  assert.equal(UNIFORMS[2].jersey, "#00b85c");
  assert.equal(UNIFORMS[2].pantStripe, "#00b85c");
  assert.equal(UNIFORMS[2].stripe, "#111111");
  assert.equal(UNIFORMS[2].socks, "#1ae070");
  assert.equal(UNIFORMS[3].jersey, "#00b8c4");

  const kit5 = UNIFORMS[4];
  assert.equal(kit5.crowdPri, "#ce1126");
  assert.equal(kit5.crowdSec, "#3a3a3a");
  assert.equal(kit5.jersey, "#ce1126");
  assert.equal(kit5.sleeves, "#ce1126");
  assert.equal(kit5.yoke, "#ffffff");
  assert.equal(kit5.pants, "#3a3a3a");
  assert.equal(kit5.helmet, "#3a3a3a");
  assert.equal(kit5.stripe, "#ce1126");
  assert.equal(kit5.sockBand, "#111111");
  assert.equal(kit5.sockBandLow, "#111111");
  assert.equal(kit5.socks, "#ce1126");
  assert.equal(kit5.armStripe, undefined);

  const kit6 = UNIFORMS[5];
  assert.equal(kit6.crowdPri, "#3a3a3a");
  assert.equal(kit6.crowdSec, "#a2aaad");
  assert.equal(kit6.helmet, "#a2aaad");
  assert.equal(kit6.jersey, "#3a3a3a");
  assert.equal(kit6.pants, "#3a3a3a");
  assert.equal(kit6.stripe, "#a2aaad");
  assert.equal(kit6.sockBand, "#111111");
  assert.equal(kit6.sockBandLow, "#111111");
  assert.equal(kit6.socks, "#a2aaad");
  assert.equal(kit6.armStripe, "#a2aaad");

  assert.equal(UNIFORMS[6].jersey, "#ff5c14");
  assert.equal(UNIFORMS[6].stripe, "#ffffff");
  assert.equal(UNIFORMS[7].helmet, "#1a58d4");
  assert.equal(UNIFORMS[7].stripe, "#1a58d4");
  assert.equal(UNIFORMS[7].socks, "#ffffff");
  assert.equal(UNIFORMS[8].jersey, "#f6eedc");
  assert.equal(UNIFORMS[8].stripe, "#e21832");
  assert.equal(UNIFORMS[9].helmet, "#ce1126");
  assert.equal(UNIFORMS[9].jersey, "#ffffff");
  assert.equal(UNIFORMS[9].stripe, "#ce1126");
  assert.equal(UNIFORMS[9].socks, "#ffffff");
});
