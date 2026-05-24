/**
 * Coordenadas aproximadas de cantones de Costa Rica.
 * Fuente: centroides geográficos de cada cantón.
 */
export const CANTONES_CR: Record<string, { lat: number; lng: number; provincia: string }> = {
  // San José
  'san jose':        { lat: 9.9281,  lng: -84.0907, provincia: 'San José' },
  'san josé':        { lat: 9.9281,  lng: -84.0907, provincia: 'San José' },
  'escazu':          { lat: 9.9179,  lng: -84.1413, provincia: 'San José' },
  'escazú':          { lat: 9.9179,  lng: -84.1413, provincia: 'San José' },
  'desamparados':    { lat: 9.8975,  lng: -84.0701, provincia: 'San José' },
  'puriscal':        { lat: 9.8440,  lng: -84.3224, provincia: 'San José' },
  'tarrazu':         { lat: 9.6411,  lng: -84.0220, provincia: 'San José' },
  'tarrazú':         { lat: 9.6411,  lng: -84.0220, provincia: 'San José' },
  'aserri':          { lat: 9.8580,  lng: -84.0959, provincia: 'San José' },
  'mora':            { lat: 9.8885,  lng: -84.1877, provincia: 'San José' },
  'goicoechea':      { lat: 9.9509,  lng: -84.0453, provincia: 'San José' },
  'santa ana':       { lat: 9.9319,  lng: -84.1842, provincia: 'San José' },
  'alajuelita':      { lat: 9.8987,  lng: -84.0977, provincia: 'San José' },
  'vazquez coronado': { lat: 9.9765, lng: -83.9955, provincia: 'San José' },
  'vazquez de coronado': { lat: 9.9765, lng: -83.9955, provincia: 'San José' },
  'acosta':          { lat: 9.7748,  lng: -84.1967, provincia: 'San José' },
  'tibas':           { lat: 9.9526,  lng: -84.0844, provincia: 'San José' },
  'tibás':           { lat: 9.9526,  lng: -84.0844, provincia: 'San José' },
  'moravia':         { lat: 9.9644,  lng: -84.0347, provincia: 'San José' },
  'montes de oca':   { lat: 9.9375,  lng: -84.0375, provincia: 'San José' },
  'turrubares':      { lat: 9.8028,  lng: -84.5181, provincia: 'San José' },
  'dota':            { lat: 9.6481,  lng: -83.9503, provincia: 'San José' },
  'curridabat':      { lat: 9.9219,  lng: -84.0206, provincia: 'San José' },
  'perez zeledon':   { lat: 9.3671,  lng: -83.7046, provincia: 'San José' },
  'pérez zeledón':   { lat: 9.3671,  lng: -83.7046, provincia: 'San José' },
  'leon cortes':     { lat: 9.7248,  lng: -84.0543, provincia: 'San José' },
  'león cortés':     { lat: 9.7248,  lng: -84.0543, provincia: 'San José' },
  // Alajuela
  'alajuela':        { lat: 10.0160, lng: -84.2148, provincia: 'Alajuela' },
  'san ramon':       { lat: 10.0888, lng: -84.4719, provincia: 'Alajuela' },
  'san ramón':       { lat: 10.0888, lng: -84.4719, provincia: 'Alajuela' },
  'grecia':          { lat: 10.0686, lng: -84.3177, provincia: 'Alajuela' },
  'san mateo':       { lat: 9.9640,  lng: -84.5125, provincia: 'Alajuela' },
  'atenas':          { lat: 9.9788,  lng: -84.3780, provincia: 'Alajuela' },
  'naranjo':         { lat: 10.1015, lng: -84.3795, provincia: 'Alajuela' },
  'palmares':        { lat: 10.0601, lng: -84.4360, provincia: 'Alajuela' },
  'poas':            { lat: 10.1046, lng: -84.2460, provincia: 'Alajuela' },
  'poás':            { lat: 10.1046, lng: -84.2460, provincia: 'Alajuela' },
  'orotina':         { lat: 9.9102,  lng: -84.5251, provincia: 'Alajuela' },
  'san carlos':      { lat: 10.3279, lng: -84.5174, provincia: 'Alajuela' },
  'alfaro ruiz':     { lat: 10.1668, lng: -84.3999, provincia: 'Alajuela' },
  'valverde vega':   { lat: 10.0995, lng: -84.3128, provincia: 'Alajuela' },
  'upala':           { lat: 10.8940, lng: -85.0142, provincia: 'Alajuela' },
  'los chiles':      { lat: 11.0269, lng: -84.7154, provincia: 'Alajuela' },
  'guatuso':         { lat: 10.6793, lng: -84.8365, provincia: 'Alajuela' },
  'rio cuarto':      { lat: 10.3785, lng: -84.2173, provincia: 'Alajuela' },
  'río cuarto':      { lat: 10.3785, lng: -84.2173, provincia: 'Alajuela' },
  // Cartago
  'cartago':         { lat: 9.8648,  lng: -83.9197, provincia: 'Cartago' },
  'paraiso':         { lat: 9.8335,  lng: -83.8651, provincia: 'Cartago' },
  'paraíso':         { lat: 9.8335,  lng: -83.8651, provincia: 'Cartago' },
  'la union':        { lat: 9.9086,  lng: -83.9912, provincia: 'Cartago' },
  'jimenez':         { lat: 9.7833,  lng: -83.7499, provincia: 'Cartago' },
  'jiménez':         { lat: 9.7833,  lng: -83.7499, provincia: 'Cartago' },
  'turrialba':       { lat: 9.9005,  lng: -83.6810, provincia: 'Cartago' },
  'alvarado':        { lat: 9.9386,  lng: -83.8490, provincia: 'Cartago' },
  'oreamuno':        { lat: 9.9236,  lng: -83.8697, provincia: 'Cartago' },
  'el guarco':       { lat: 9.8344,  lng: -83.9800, provincia: 'Cartago' },
  // Heredia
  'heredia':         { lat: 9.9980,  lng: -84.1197, provincia: 'Heredia' },
  'barva':           { lat: 10.0228, lng: -84.1294, provincia: 'Heredia' },
  'santo domingo':   { lat: 9.9815,  lng: -84.0840, provincia: 'Heredia' },
  'santa barbara':   { lat: 10.0344, lng: -84.1553, provincia: 'Heredia' },
  'santa bárbara':   { lat: 10.0344, lng: -84.1553, provincia: 'Heredia' },
  'san rafael':      { lat: 10.0261, lng: -84.0988, provincia: 'Heredia' },
  'san isidro':      { lat: 10.0086, lng: -84.0753, provincia: 'Heredia' },
  'belen':           { lat: 9.9763,  lng: -84.1866, provincia: 'Heredia' },
  'belén':           { lat: 9.9763,  lng: -84.1866, provincia: 'Heredia' },
  'flores':          { lat: 10.0017, lng: -84.1636, provincia: 'Heredia' },
  'san pablo':       { lat: 10.0051, lng: -84.1003, provincia: 'Heredia' },
  'sarapiqui':       { lat: 10.4763, lng: -84.0145, provincia: 'Heredia' },
  'sarapiquí':       { lat: 10.4763, lng: -84.0145, provincia: 'Heredia' },
  // Guanacaste
  'liberia':         { lat: 10.6340, lng: -85.4360, provincia: 'Guanacaste' },
  'nicoya':          { lat: 10.1510, lng: -85.4519, provincia: 'Guanacaste' },
  'santa cruz':      { lat: 10.2655, lng: -85.5860, provincia: 'Guanacaste' },
  'bagaces':         { lat: 10.5277, lng: -85.2558, provincia: 'Guanacaste' },
  'carrillo':        { lat: 10.3921, lng: -85.6197, provincia: 'Guanacaste' },
  'canyas':          { lat: 10.4252, lng: -85.1123, provincia: 'Guanacaste' },
  'cañas':           { lat: 10.4252, lng: -85.1123, provincia: 'Guanacaste' },
  'abangares':       { lat: 10.2549, lng: -85.0168, provincia: 'Guanacaste' },
  'tilaran':         { lat: 10.4696, lng: -84.9703, provincia: 'Guanacaste' },
  'tilarán':         { lat: 10.4696, lng: -84.9703, provincia: 'Guanacaste' },
  'nandayure':       { lat: 10.0207, lng: -85.2117, provincia: 'Guanacaste' },
  'la cruz':         { lat: 11.0738, lng: -85.6275, provincia: 'Guanacaste' },
  'hojancha':        { lat: 10.0808, lng: -85.3866, provincia: 'Guanacaste' },
  // Puntarenas
  'puntarenas':      { lat: 9.9778,  lng: -84.8299, provincia: 'Puntarenas' },
  'esparza':         { lat: 9.9961,  lng: -84.6643, provincia: 'Puntarenas' },
  'buenos aires':    { lat: 9.1658,  lng: -83.3310, provincia: 'Puntarenas' },
  'montes de oro':   { lat: 10.0805, lng: -84.7029, provincia: 'Puntarenas' },
  'osa':             { lat: 8.9136,  lng: -83.4654, provincia: 'Puntarenas' },
  'aguirre':         { lat: 9.4762,  lng: -84.1720, provincia: 'Puntarenas' },
  'quepos':          { lat: 9.4319,  lng: -84.1626, provincia: 'Puntarenas' },
  'golfito':         { lat: 8.6479,  lng: -83.1617, provincia: 'Puntarenas' },
  'coto brus':       { lat: 8.9642,  lng: -82.9636, provincia: 'Puntarenas' },
  'parrita':         { lat: 9.5230,  lng: -84.3310, provincia: 'Puntarenas' },
  'corredores':      { lat: 8.5620,  lng: -83.0460, provincia: 'Puntarenas' },
  'garabito':        { lat: 9.6284,  lng: -84.6325, provincia: 'Puntarenas' },
  'jaco':            { lat: 9.6187,  lng: -84.6257, provincia: 'Puntarenas' },
  'jacó':            { lat: 9.6187,  lng: -84.6257, provincia: 'Puntarenas' },
  // Limón
  'limon':           { lat: 9.9932,  lng: -83.0356, provincia: 'Limón' },
  'limón':           { lat: 9.9932,  lng: -83.0356, provincia: 'Limón' },
  'pococi':          { lat: 10.3009, lng: -83.7296, provincia: 'Limón' },
  'pocosí':          { lat: 10.3009, lng: -83.7296, provincia: 'Limón' },
  'guácimo':         { lat: 10.2131, lng: -83.6849, provincia: 'Limón' },
  'guacimo':         { lat: 10.2131, lng: -83.6849, provincia: 'Limón' },
  'matina':          { lat: 10.0763, lng: -83.3053, provincia: 'Limón' },
  'talamanca':       { lat: 9.5727,  lng: -82.9706, provincia: 'Limón' },
  'siquirres':       { lat: 10.1009, lng: -83.5106, provincia: 'Limón' },
};

/**
 * Convierte texto libre de provincia/cantón a coordenadas.
 * Normaliza tildes, mayúsculas y variantes comunes.
 */
export function cantonToCoords(
  input: string,
): { lat: number; lng: number; provincia: string; canton: string } | null {
  const normalized = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/[^a-z\s]/g, '')
    .trim();

  // Buscar match exacto primero
  const entry = CANTONES_CR[normalized];
  if (entry) return { ...entry, canton: normalized };

  // Buscar match parcial (el input puede contener más palabras)
  for (const [key, val] of Object.entries(CANTONES_CR)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return { ...val, canton: key };
    }
  }

  return null;
}

/**
 * Distancia en km entre dos puntos (fórmula Haversine simplificada).
 */
export function distanciaKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
