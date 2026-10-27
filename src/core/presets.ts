export interface Preset {
  name: string;
  notation: string;
  bpm: number;
}

export const PRESETS: Preset[] = [
  { name: "Pop: verse–pre–chorus", notation: "In4 Vs8 Pre4 Ch8 Vs8 Pre4 Ch8 Br8 Ch8 Ch8 Out4", bpm: 110 },
  { name: "Rock: verse–chorus–bridge", notation: "In4 Vs8 Ch8 Vs8 Ch8 Solo8 Br8 Ch8 Out4", bpm: 120 },
  { name: "AABA 32-bar standard", notation: "Vs8 Vs8 Br8 Vs8", bpm: 120 },
  { name: "Strophic folk", notation: "In4 Vs16 Vs16 Vs16 Vs16 Out4", bpm: 90 },
  { name: "12-bar blues", notation: "In4 Vs12 Vs12 Solo12 Vs12 Out4", bpm: 100 },
  { name: "Example: 7-bar chorus", notation: "Vs8 Vs8 Ch7", bpm: 100 },
  { name: "Example: 3 verses first", notation: "V V V C B O", bpm: 100 },
];
