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

// Manufacturer logo shown on each make's tile in the vehicle picker.
// Files live in assets/logos/, sourced from the MIT-licensed
// filippofilip95/car-logos-dataset (github.com/filippofilip95/car-logos-dataset);
// the logo artwork itself remains the trademark of each respective manufacturer,
// shown here only to identify which makes we service. "Other" has no logo and
// falls back to a plain text tile.
const MAKE_LOGO_SLUGS = {
  Acura: "acura",
  "Alfa Romeo": "alfa-romeo",
  Audi: "audi",
  BMW: "bmw",
  Buick: "buick",
  Cadillac: "cadillac",
  Chevrolet: "chevrolet",
  Chrysler: "chrysler",
  Dodge: "dodge",
  Ford: "ford",
  Genesis: "genesis",
  GMC: "gmc",
  Honda: "honda",
  Hyundai: "hyundai",
  "Infiniti": "infiniti",
  Jaguar: "jaguar",
  Jeep: "jeep",
  Kia: "kia",
  "Land Rover": "land-rover",
  Lexus: "lexus",
  Lincoln: "lincoln",
  Mazda: "mazda",
  "Mercedes-Benz": "mercedes-benz",
  Mini: "mini",
  Mitsubishi: "mitsubishi",
  Nissan: "nissan",
  Porsche: "porsche",
  Ram: "ram",
  Subaru: "subaru",
  Tesla: "tesla",
  Toyota: "toyota",
  Volkswagen: "volkswagen",
  Volvo: "volvo",
};
