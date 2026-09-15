// Vehicle catalog used to power the cascading Year / Make / Model quote selector.
// Static local dataset — no external API calls required.

const VEHICLE_YEARS = (() => {
  const current = new Date().getFullYear() + 1;
  const years = [];
  for (let y = current; y >= 1995; y--) years.push(y);
  return years;
})();

const VEHICLE_MODELS_BY_MAKE = {
  Acura: ["ILX", "TLX", "RDX", "MDX", "Integra", "NSX"],
  "Alfa Romeo": ["Giulia", "Stelvio", "Tonale", "4C"],
  Audi: ["A3", "A4", "A6", "A8", "Q3", "Q5", "Q7", "Q8", "e-tron", "TT", "R8"],
  BMW: ["2 Series", "3 Series", "4 Series", "5 Series", "7 Series", "X1", "X3", "X5", "X7", "i4", "iX", "M3", "M5"],
  Buick: ["Encore", "Encore GX", "Envision", "Enclave"],
  Cadillac: ["CT4", "CT5", "XT4", "XT5", "XT6", "Escalade", "Lyriq"],
  Chevrolet: ["Spark", "Malibu", "Camaro", "Corvette", "Equinox", "Blazer", "Traverse", "Tahoe", "Suburban", "Silverado", "Colorado", "Trax", "Bolt EV"],
  Chrysler: ["300", "Pacifica", "Voyager"],
  Dodge: ["Charger", "Challenger", "Durango", "Hornet", "Journey"],
  Ford: ["Fiesta", "Focus", "Fusion", "Mustang", "Escape", "Edge", "Explorer", "Expedition", "Bronco", "Bronco Sport", "F-150", "F-250", "Ranger", "Maverick", "Mustang Mach-E"],
  Genesis: ["G70", "G80", "G90", "GV70", "GV80"],
  GMC: ["Terrain", "Acadia", "Yukon", "Sierra", "Canyon", "Hummer EV"],
  Honda: ["Civic", "Accord", "Insight", "CR-V", "HR-V", "Pilot", "Passport", "Ridgeline", "Odyssey", "Fit"],
  Hyundai: ["Accent", "Elantra", "Sonata", "Veloster", "Venue", "Kona", "Tucson", "Santa Fe", "Palisade", "Ioniq 5", "Ioniq 6"],
  "Infiniti": ["Q50", "Q60", "QX50", "QX55", "QX60", "QX80"],
  Jaguar: ["XE", "XF", "F-Type", "E-Pace", "F-Pace", "I-Pace"],
  Jeep: ["Compass", "Renegade", "Cherokee", "Grand Cherokee", "Wrangler", "Gladiator", "Wagoneer"],
  Kia: ["Rio", "Forte", "K5", "Stinger", "Soul", "Seltos", "Sportage", "Sorento", "Telluride", "EV6"],
  "Land Rover": ["Discovery", "Discovery Sport", "Range Rover", "Range Rover Sport", "Range Rover Evoque", "Defender"],
  Lexus: ["IS", "ES", "GS", "LS", "UX", "NX", "RX", "GX", "LX", "RC"],
  Lincoln: ["Corsair", "Nautilus", "Aviator", "Navigator"],
  Mazda: ["Mazda3", "Mazda6", "CX-30", "CX-5", "CX-50", "CX-9", "MX-5 Miata"],
  "Mercedes-Benz": ["A-Class", "C-Class", "E-Class", "S-Class", "CLA", "GLA", "GLB", "GLC", "GLE", "GLS", "G-Class", "EQS", "EQE"],
  Mini: ["Cooper", "Cooper Clubman", "Cooper Countryman"],
  Mitsubishi: ["Mirage", "Outlander", "Outlander Sport", "Eclipse Cross"],
  Nissan: ["Versa", "Sentra", "Altima", "Maxima", "Z", "Kicks", "Rogue", "Murano", "Pathfinder", "Armada", "Frontier", "Titan", "Leaf", "Ariya"],
  Porsche: ["718 Cayman", "718 Boxster", "911", "Panamera", "Macan", "Cayenne", "Taycan"],
  Ram: ["1500", "2500", "3500", "ProMaster"],
  Subaru: ["Impreza", "Legacy", "WRX", "BRZ", "Crosstrek", "Forester", "Outback", "Ascent", "Solterra"],
  Tesla: ["Model 3", "Model S", "Model X", "Model Y", "Cybertruck"],
  Toyota: ["Corolla", "Camry", "Avalon", "Prius", "GR86", "Supra", "C-HR", "RAV4", "Venza", "Highlander", "4Runner", "Sequoia", "Tacoma", "Tundra", "Sienna", "bZ4X"],
  Volkswagen: ["Jetta", "Passat", "Golf", "GTI", "Arteon", "Taos", "Tiguan", "Atlas", "ID.4"],
  Volvo: ["S60", "S90", "V60", "XC40", "XC60", "XC90", "C40 Recharge"],
  Other: ["Other / Not Listed"],
};

const VEHICLE_MAKES = Object.keys(VEHICLE_MODELS_BY_MAKE).sort((a, b) => a.localeCompare(b));

// Badge shown on each make's tile in the vehicle picker. These are original
// geometric marks (not traced from any manufacturer's registered logo) —
// a shape + color pairing loosely evocative of each brand, plus a text
// fallback for brands with no assigned shape.
const MAKE_BADGES = {
  Acura: { shape: "shield", color: "#334155", text: "A" },
  "Alfa Romeo": { shape: "shield", color: "#7C2D12", text: "AR" },
  Audi: { shape: "ring", color: "#1E3A8A" },
  BMW: { shape: "quarter", color: "#0369A1" },
  Buick: { shape: "shield", color: "#0369A1", text: "B" },
  Cadillac: { shape: "shield", color: "#92400E", text: "C" },
  Chevrolet: { shape: "chevron", color: "#B91C1C" },
  Chrysler: { shape: "hex", color: "#334155", text: "C" },
  Dodge: { shape: "text", color: "#B91C1C", text: "DO" },
  Ford: { shape: "oval", color: "#1E3A8A", text: "F" },
  Genesis: { shape: "hex", color: "#0F172A", text: "G" },
  GMC: { shape: "text", color: "#B45309", text: "GMC" },
  Honda: { shape: "text", color: "#0369A1", text: "H" },
  Hyundai: { shape: "oval", color: "#0F766E", text: "H" },
  "Infiniti": { shape: "ring", color: "#0F172A" },
  Jaguar: { shape: "text", color: "#065F46", text: "JAG" },
  Jeep: { shape: "shield", color: "#065F46", text: "J" },
  Kia: { shape: "oval", color: "#B91C1C", text: "K" },
  "Land Rover": { shape: "hex", color: "#065F46", text: "LR" },
  Lexus: { shape: "ring", color: "#334155", text: "L" },
  Lincoln: { shape: "diamond", color: "#6D28D9", text: "L" },
  Mazda: { shape: "text", color: "#B91C1C", text: "MA" },
  "Mercedes-Benz": { shape: "star", color: "#334155" },
  Mini: { shape: "ring", color: "#92400E", text: "M" },
  Mitsubishi: { shape: "diamond", color: "#B91C1C" },
  Nissan: { shape: "text", color: "#7C2D12", text: "NI" },
  Porsche: { shape: "shield", color: "#92400E", text: "P" },
  Ram: { shape: "text", color: "#7C2D12", text: "RAM" },
  Subaru: { shape: "star", color: "#1E3A8A" },
  Tesla: { shape: "text", color: "#334155", text: "T" },
  Toyota: { shape: "ring", color: "#B91C1C" },
  Volkswagen: { shape: "text", color: "#1E3A8A", text: "VW" },
  Volvo: { shape: "arrowcircle", color: "#334155" },
  Other: { shape: "text", color: "#64748B", text: "OT" },
};
