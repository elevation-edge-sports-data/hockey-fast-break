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

/** Home burgundy and blue (#236192 on helmet, pants, yoke). */
const AVS_BLUE = "#236192";
const AVS_BURGUNDY = "#5a1021";

export function kitName(id: number): string {
  if (id === 0) return "Burgundy & Blue";
  if (id === 2) return "Green & Black";
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
    stripe: AVS_BURGUNDY,
    socks: AVS_BURGUNDY,
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
    helmet: "#3e4c56",
    visor: "#2a343c",
    jersey: "#c49a3e",
    yoke: "#c49a3e",
    sleeves: "#c49a3e",
    pants: "#3e4c56",
    stripe: "#c49a3e",
    socks: "#c49a3e",
    gloves: "#3e4c56",
    skates: "#2a3238",
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
    helmet: "#3a3a3a",
    visor: "#2c2c2c",
    jersey: "#00b85c",
    yoke: "#00b85c",
    sleeves: "#00b85c",
    pants: "#3a3a3a",
    stripe: "#1ae070",
    socks: "#00b85c",
    gloves: "#3a3a3a",
    skates: "#2a2a2a",
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
    helmet: "#0d5c6c",
    visor: "#0a3844",
    jersey: "#00b8c4",
    yoke: "#0d5c6c",
    sleeves: "#00b8c4",
    pants: "#0d5c6c",
    stripe: "#e01838",
    socks: "#00b8c4",
    gloves: "#0d5c6c",
    skates: "#1a2228",
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
    helmet: "#3a3a3a",
    visor: "#3a2218",
    jersey: "#ff5c14",
    yoke: "#3a3a3a",
    sleeves: "#ff5c14",
    pants: "#3a3a3a",
    stripe: "#ffffff",
    socks: "#ff5c14",
    gloves: "#3a3a3a",
    skates: "#2a2a2a",
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
    helmet: "#1a58d4",
    visor: "#163868",
    jersey: "#ffffff",
    yoke: "#1a58d4",
    sleeves: "#ffffff",
    pants: "#1a58d4",
    stripe: "#ffffff",
    socks: "#ffffff",
    gloves: "#1a58d4",
    skates: "#0a2048",
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
    helmet: "#2a6e5c",
    visor: "#1a4038",
    jersey: "#f6eedc",
    yoke: "#2a6e5c",
    sleeves: "#f6eedc",
    pants: "#2a6e5c",
    stripe: "#e21832",
    socks: "#f6eedc",
    gloves: "#2a6e5c",
    skates: "#241e14",
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
    visor: "#4a1822",
    jersey: "#ffffff",
    yoke: "#ce1126",
    sleeves: "#ffffff",
    pants: "#ce1126",
    stripe: "#ffffff",
    socks: "#ffffff",
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
