# Writes data/land.js: a 1-bit equirectangular land mask, base64, from the global-land-mask package.
import base64
import numpy as np
from global_land_mask import globe

W, H = 2880, 1440  # 8 px per degree; the max zoom in js/params.js should stay near 1 char per px

lat = 90 - (np.arange(H) + 0.5) * 180 / H
lon = -180 + (np.arange(W) + 0.5) * 360 / W
lon_g, lat_g = np.meshgrid(lon, lat)
bits = np.packbits(globe.is_land(lat_g, lon_g).astype(np.uint8).ravel())
with open('data/land.js', 'w') as f:
    f.write(f"export const LAND_W={W},LAND_H={H},LAND_B64='{base64.b64encode(bits.tobytes()).decode()}';\n")
