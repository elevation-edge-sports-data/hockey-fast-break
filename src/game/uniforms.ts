export type UniformKit = {
  id: number;
  helmet: string;
  visor: string;
  jersey: string;
  yoke: string;
  sleeves: string;
  pants: string;
  stripe: string;
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

/** Home burgundy with official Avalanche blue (#236192) on helmet, pants, yoke. */
const AVS_BLUE = "#236192";
const AVS_BURGUNDY = "#6f263d";

export const UNIFORMS: UniformKit[] = [
  {
    id: 0,
    helmet: AVS_BLUE,
    visor: "#0d2438",
    jersey: "#9a2348",
    yoke: AVS_BLUE,
    sleeves: AVS_BLUE,
    pants: AVS_BLUE,
    stripe: AVS_BURGUNDY,
    socks: "#9a2348",
    gloves: AVS_BLUE,
    skates: "#0d0f12",
    number: "#ffffff",
    numberOutline: AVS_BLUE,
    stick: "#1a1c1f",
    tape: "#f4f1ea",
    ribbon: AVS_BURGUNDY,
    crowdPri: AVS_BURGUNDY,
    crowdSec: AVS_BLUE,
  },
  {
    id: 1,
    helmet: "#1c2428",
    visor: "#14181a",
    jersey: "#d4a84b",
    yoke: "#d4a84b",
    sleeves: "#d4a84b",
    pants: "#1c2428",
    stripe: "#d4a84b",
    socks: "#d4a84b",
    gloves: "#1c2428",
    skates: "#1a1e20",
    number: "#2a3336",
    numberOutline: "#ffffff",
    stick: "#1a1c1f",
    tape: "#f4f1ea",
    ribbon: "#b4975a",
    crowdPri: "#b4975a",
    crowdSec: "#2a3336",
  },
  {
    id: 2,
    helmet: "#0a0a0a",
    visor: "#0c0c0c",
    jersey: "#00924c",
    yoke: "#00924c",
    sleeves: "#00924c",
    pants: "#0a0a0a",
    stripe: "#00c261",
    socks: "#00924c",
    gloves: "#0a0a0a",
    skates: "#111111",
    number: "#ffffff",
    numberOutline: "#111111",
    stick: "#1a1c1f",
    tape: "#f4f1ea",
    ribbon: "#006847",
    crowdPri: "#006847",
    crowdSec: "#111111",
  },
  {
    id: 3,
    helmet: "#062a32",
    visor: "#04181c",
    jersey: "#008e97",
    yoke: "#062a32",
    sleeves: "#008e97",
    pants: "#062a32",
    stripe: "#c8102e",
    socks: "#008e97",
    gloves: "#062a32",
    skates: "#0d1114",
    number: "#ffffff",
    numberOutline: "#062a32",
    stick: "#1a1c1f",
    tape: "#f4f1ea",
    ribbon: "#008e97",
    crowdPri: "#008e97",
    crowdSec: "#062a32",
  },
  {
    id: 4,
    helmet: "#111111",
    visor: "#1a0c08",
    jersey: "#ff4d00",
    yoke: "#111111",
    sleeves: "#ff4d00",
    pants: "#111111",
    stripe: "#ffffff",
    socks: "#ff4d00",
    gloves: "#111111",
    skates: "#111111",
    number: "#ffffff",
    numberOutline: "#111111",
    stick: "#1a1c1f",
    tape: "#f4f1ea",
    ribbon: "#e35205",
    crowdPri: "#e35205",
    crowdSec: "#111111",
  },
  {
    id: 5,
    helmet: "#0033a1",
    visor: "#0a1428",
    jersey: "#f4f6f8",
    yoke: "#0033a1",
    sleeves: "#f4f6f8",
    pants: "#0033a1",
    stripe: "#ffffff",
    socks: "#f4f6f8",
    gloves: "#0033a1",
    skates: "#00102e",
    number: "#0033a1",
    numberOutline: "#0033a1",
    stick: "#1a1c1f",
    tape: "#f4f1ea",
    ribbon: "#0033a1",
    crowdPri: "#0033a1",
    crowdSec: "#0033a1",
  },
  {
    id: 6,
    helmet: "#173f35",
    visor: "#0c1c18",
    jersey: "#f0e6d0",
    yoke: "#173f35",
    sleeves: "#f0e6d0",
    pants: "#173f35",
    stripe: "#ce1126",
    socks: "#f0e6d0",
    gloves: "#173f35",
    skates: "#12100c",
    number: "#ce1126",
    numberOutline: "#ffffff",
    stick: "#1a1c1f",
    tape: "#f4f1ea",
    ribbon: "#173f35",
    crowdPri: "#f0e6d0",
    crowdSec: "#173f35",
  },
  {
    id: 7,
    helmet: "#ce1126",
    visor: "#2a0a10",
    jersey: "#f4f6f8",
    yoke: "#ce1126",
    sleeves: "#f4f6f8",
    pants: "#ce1126",
    stripe: "#ffffff",
    socks: "#f4f6f8",
    gloves: "#ce1126",
    skates: "#1a0a0c",
    number: "#ce1126",
    numberOutline: "#ffffff",
    stick: "#1a1c1f",
    tape: "#f4f1ea",
    ribbon: "#ce1126",
    crowdPri: "#ce1126",
    crowdSec: "#f4f6f8",
  },
];

export function kitById(id: number): UniformKit {
  return UNIFORMS[id] ?? UNIFORMS[0]!;
}
