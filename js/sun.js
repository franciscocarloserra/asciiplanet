// Day/night: where the sun is for the current UTC time.

// World-space direction of the sun right now (subsolar point; ignores equation of time, ~±4 min).
export function sunDir(d = new Date()) {
  const doy = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
  const lat = -23.44 * Math.PI / 180 * Math.cos(2 * Math.PI * (doy + 10) / 365);
  const lon = -(d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600 - 12) * Math.PI / 12;
  return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
}
