/* skins.js - exact export of skins */
export const skins = {
  "gameboy": {
    "id":"gameboy",
    "type":"single",
    "aspectRatio":"10:9",
    "overlay": "/skins/gameboy.svg",
    "screen": { "x": 0.10, "y": 0.145, "w": 0.80, "h": 0.60 },
    "controls": {
      "A": { "x": 0.78, "y": 0.70, "w": 0.12 },
      "B": { "x": 0.68, "y": 0.77, "w": 0.12 },
      "START": { "x": 0.52, "y": 0.92, "w": 0.13 },
      "SELECT": { "x": 0.42, "y": 0.92, "w": 0.13 },
      "DPAD": { "x": 0.22, "y": 0.72, "w": 0.22 }
    }
  },
  "gba": {
    "id":"gba",
    "type":"single",
    "aspectRatio":"3:2",
    "overlay": "/skins/gba.svg",
    "screen": { "x": 0.10, "y": 0.18, "w": 0.80, "h": 0.52 },
    "controls": {
      "A": { "x": 0.82, "y": 0.70, "w": 0.12 },
      "B": { "x": 0.73, "y": 0.78, "w": 0.12 },
      "L": { "x": 0.08, "y": 0.05, "w": 0.14 },
      "R": { "x": 0.92, "y": 0.05, "w": 0.14 },
      "DPAD": { "x": 0.18, "y": 0.72, "w": 0.20 }
    }
  },
  "ds": {
    "id":"ds",
    "type":"dual",
    "aspectRatio":"dual",
    "overlay": "/skins/ds.svg",
    "screens": [
      { "x":0.10, "y":0.08, "w":0.80, "h":0.30 },
      { "x":0.10, "y":0.48, "w":0.80, "h":0.30 }
    ],
    "controls": {
      "A": { "x": 0.82, "y": 0.83, "w": 0.10 },
      "B": { "x": 0.73, "y": 0.88, "w": 0.10 },
      "START": { "x": 0.52, "y": 0.96, "w": 0.12 },
      "DPAD": { "x": 0.18, "y": 0.83, "w": 0.20 }
    }
  },
  "psp": {
    "id":"psp",
    "type":"single",
    "aspectRatio":"16:9",
    "overlay": "/skins/psp.svg",
    "screen": { "x": 0.05, "y": 0.15, "w": 0.90, "h": 0.60 },
    "controls": {
      "A": { "x": 0.84, "y": 0.75, "w": 0.14 },
      "B": { "x": 0.76, "y": 0.82, "w": 0.14 },
      "DPAD": { "x": 0.16, "y": 0.75, "w": 0.22 }
    }
  }
};
