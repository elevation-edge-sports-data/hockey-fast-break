export type UniformKit = {
  id: number;
  helmet: string;
  visor: string;
  jersey: string;
  yoke: string;
  sleeves: string;
  pants: string;
  /** Sock bands, and the pants stripe when pantStripe is omitted. */
  stripe: string;
  /** Side and thigh stripe. Omitted kits use stripe. */
  pantStripe?: string;
  /** Upper sock band. Omitted kits use stripe. */
  sockBand?: string;
  /** Lower sock band. Omitted kits use stripe. */
  sockBandLow?: string;
  /**
   * Sleeve stripes in the kit 2 layout (band plus sides, front, and back).
   * Kit 2 itself still paints that layout with the pants color.
   */
  armStripe?: string;
  socks: string;
  gloves: string;
  skates: string;
  number: string;
  numberOutline: string;
  stick: string;
  tape: string;
  ribbon: string;
  crowdPri: string;
  crowdSec: string;
};

export const COL_KIT = 0;
export const VGK_KIT = 1;
export const DAL_KIT = 2;

/** Home burgundy and blue (#005488 on helmet, pants, yoke). */
const AVS_BLUE = "#005488";
const AVS_BURGUNDY = "#8b2942";

export function kitName(id: number): string {
  return `Kit ${id + 1}`;
}

export const UNIFORMS: UniformKit[] = [
  {
    id: 0,
    helmet: AVS_BLUE,
    visor: "#163a58",
    jersey: AVS_BURGUNDY,
    yoke: AVS_BLUE,
    sleeves: AVS_BLUE,
    pants: AVS_BLUE,
    stripe: AVS_BLUE,
    pantStripe: AVS_BLUE,
    sockBand: AVS_BURGUNDY,
    sockBandLow: AVS_BURGUNDY,
    socks: "#ffffff",
    gloves: AVS_BLUE,
    skates: "#0d0f12",
    number: "#ffffff",
    numberOutline: AVS_BLUE,
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: AVS_BURGUNDY,
    crowdPri: AVS_BURGUNDY,
    crowdSec: AVS_BLUE,
  },
  {
    id: 1,
    helmet: "#333f42",
    visor: "#2a343c",
    jersey: "#B4975A",
    yoke: "#B4975A",
    sleeves: "#B4975A",
    pants: "#333f42",
    stripe: "#111111",
    pantStripe: "#333F43",
    sockBand: "#B4975A",
    sockBandLow: "#B4975A",
    socks: "#ffffff",
    gloves: "#ffffff",
    skates: "#2a3238",
    number: "#2a3336",
    numberOutline: "#ffffff",
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: "#b4975a",
    crowdPri: "#b4975a",
    crowdSec: "#2a3336",
  },
  {
    id: 2,
    helmet: "#3a3a3a",
    visor: "#2c2c2c",
    jersey: "#006847",
    yoke: "#006847",
    sleeves: "#006847",
    pants: "#3a3a3a",
    stripe: "#111111",
    pantStripe: "#006847",
    armStripe: "#ffffff",
    socks: "#006847",
    gloves: "#3a3a3a",
    skates: "#2a2a2a",
    number: "#ffffff",
    numberOutline: "#111111",
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: "#006847",
    crowdPri: "#006847",
    crowdSec: "#111111",
  },
  {
    id: 3,
    helmet: "#99d9d9",
    visor: "#0a3844",
    jersey: "#99d9d9",
    yoke: "#001628",
    sleeves: "#99d9d9",
    pants: "#001628",
    stripe: "#e9072b",
    socks: "#99d9d9",
    gloves: "#001628",
    skates: "#1a2228",
    number: "#ffffff",
    numberOutline: "#062a32",
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: "#008e97",
    crowdPri: "#008e97",
    crowdSec: "#062a32",
  },
  {
    id: 4,
    helmet: "#3a3a3a",
    visor: "#2c2c2c",
    jersey: "#CF0A2C",
    yoke: "#CF0A2C",
    sleeves: "#CF0A2C",
    pants: "#3a3a3a",
    stripe: "#CF0A2C",
    armStripe: "#ffffff",
    sockBand: "#111111",
    sockBandLow: "#111111",
    socks: "#CF0A2C",
    gloves: "#3a3a3a",
    skates: "#2a2a2a",
    number: "#ffffff",
    numberOutline: "#111111",
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: "#CF0A2C",
    crowdPri: "#CF0A2C",
    crowdSec: "#3a3a3a",
  },
  {
    id: 5,
    helmet: "#3a3a3a",
    visor: "#6e7680",
    jersey: "#3a3a3a",
    yoke: "#3a3a3a",
    sleeves: "#3a3a3a",
    pants: "#3a3a3a",
    stripe: "#a2aaad",
    sockBand: "#a2aaad",
    sockBandLow: "#a2aaad",
    armStripe: "#a2aaad",
    socks: "#111111",
    gloves: "#3a3a3a",
    skates: "#2a2a2a",
    number: "#ffffff",
    numberOutline: "#a2aaad",
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: "#a2aaad",
    crowdPri: "#3a3a3a",
    crowdSec: "#a2aaad",
  },
  {
    id: 6,
    helmet: "#ffffff",
    visor: "#3a2218",
    jersey: "#ffffff",
    yoke: "#F74902",
    sleeves: "#F74902",
    pants: "#3a3a3a",
    stripe: "#ffffff",
    pantStripe: "#F74902",
    socks: "#F74902",
    gloves: "#3a3a3a",
    skates: "#2a2a2a",
    number: "#F74902",
    numberOutline: "#111111",
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: "#e35205",
    crowdPri: "#e35205",
    crowdSec: "#111111",
  },
  {
    id: 7,
    helmet: "#ffffff",
    visor: "#163868",
    jersey: "#ffffff",
    yoke: "#ffffff",
    sleeves: "#ffffff",
    pants: "#002868",
    stripe: "#002868",
    pantStripe: "#ffffff",
    armStripe: "#002868",
    socks: "#ffffff",
    gloves: "#002868",
    skates: "#0a2048",
    number: "#002868",
    numberOutline: "#ffffff",
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: "#0033a1",
    crowdPri: "#0033a1",
    crowdSec: "#0033a1",
  },
  {
    id: 8,
    helmet: "#f6eedc",
    visor: "#1a4038",
    jersey: "#f6eedc",
    yoke: "#154734",
    sleeves: "#f6eedc",
    pants: "#154734",
    stripe: "#A6192E",
    armStripe: "#154734",
    socks: "#f6eedc",
    gloves: "#154734",
    skates: "#241e14",
    number: "#ce1126",
    numberOutline: "#154734",
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: "#173f35",
    crowdPri: "#f0e6d0",
    crowdSec: "#173f35",
  },
  {
    id: 9,
    helmet: "#ffffff",
    visor: "#4a1822",
    jersey: "#ffffff",
    yoke: "#ffffff",
    sleeves: "#ce1126",
    pants: "#ce1126",
    stripe: "#ce1126",
    pantStripe: "#ffffff",
    socks: "#ffffff",
    gloves: "#ce1126",
    skates: "#1a0a0c",
    number: "#ce1126",
    numberOutline: "#ffffff",
    stick: "#1a1c1f",
    tape: "#ffffff",
    ribbon: "#ce1126",
    crowdPri: "#ce1126",
    crowdSec: "#f4f6f8",
  },
];

export function kitById(id: number): UniformKit {
  return UNIFORMS[id] ?? UNIFORMS[0]!;
}

/**
 * Colors the HUD kit bars show, and the colors the stands, scoreboard chip,
 * and jumbo token should wear for that same kit. `stripe` is the pants stripe
 * actually drawn on the player (pantStripe when the kit has one).
 */
export function kitWornColors(kit: UniformKit): {
  helmet: string;
  jersey: string;
  pants: string;
  stripe: string;
} {
  return {
    helmet: kit.helmet,
    jersey: kit.jersey,
    pants: kit.pants,
    stripe: kit.pantStripe ?? kit.stripe,
  };
}
