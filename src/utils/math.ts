// Math utility functions for spatial audio calculations

/**
 * Clamps a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * Converts radians to degrees
 */
export function radToDeg(rad: number): number {
    return rad * (180 / Math.PI);
}

/**
 * Converts degrees to radians
 */
export function degToRad(deg: number): number {
    return deg * (Math.PI / 180);
}

/**
 * Normalizes an angle to be within -180 to 180 degrees
 */
export function normalizeDegrees(deg: number): number {
    let normalized = deg % 360;
    if (normalized > 180) {
        normalized -= 360;
    } else if (normalized < -180) {
        normalized += 360;
    }
    return normalized;
}

/**
 * Converts a 2D point relative to circle center to azimuth/elevation
 * @param x - X position relative to center
 * @param y - Y position relative to center  
 * @param radius - Radius of the circle
 * @returns Object with azimuth and elevation in degrees
 */
export function pointToAzEl(
    x: number,
    y: number,
    radius: number
): { azDeg: number; elDeg: number } {
    // Calculate distance from center (normalized to 0-1)
    const distance = Math.sqrt(x * x + y * y);
    const normalizedDistance = clamp(distance / radius, 0, 1);

    // Calculate angle from center
    // Note: In screen coordinates, Y increases downward
    // UI inversion: LEFT on screen = +90°, RIGHT on screen = -90°
    const angle = Math.atan2(-x, -y);

    // Convert to azimuth (degrees)
    const azDeg = normalizeDegrees(radToDeg(angle));

    // Map distance to elevation
    // Center (distance=0) → elevation=90° (straight up)
    // Edge (distance=1) → elevation=0° (horizon)
    const elDeg = (1 - normalizedDistance) * 90;

    return { azDeg, elDeg };
}

/**
 * Converts azimuth/elevation to 2D point coordinates
 * @param azDeg - Azimuth in degrees (-180 to 180)
 * @param elDeg - Elevation in degrees (0 to 90)
 * @param radius - Radius of the circle
 * @returns Object with x and y coordinates relative to center
 */
export function azElToPoint(
    azDeg: number,
    elDeg: number,
    radius: number
): { x: number; y: number } {
    // Convert elevation to distance (0-1)
    // 90° elevation → distance 0 (center)
    // 0° elevation → distance 1 (edge)
    const normalizedDistance = 1 - (clamp(elDeg, 0, 90) / 90);
    const distance = normalizedDistance * radius;

    // Convert azimuth to angle
    const angleRad = degToRad(azDeg);

    // Calculate x, y (reverse of pointToAzEl)
    // Negate x to match UI inversion (LEFT=+90°, RIGHT=-90°)
    const x = -Math.sin(angleRad) * distance;
    const y = -Math.cos(angleRad) * distance;

    return { x, y };
}

/**
 * Computes quaternion rotation values from azimuth/elevation
 * Matches IEM StereoEncoder display (W, X, Y, Z quaternion components)
 * 
 * For yaw (azimuth) and pitch (elevation):
 * - At front (0°, 0°): W=1, X=0, Y=0, Z=0 (identity - no rotation)
 * - At back (180°, 0°): W=0, X=0, Y=0, Z=1
 * - Left/Right controlled by azimuth (yaw) → affects Z
 * - Up/Down controlled by elevation (pitch) → affects Y
 */
export function computeWXYZ(azDeg: number, elDeg: number): { w: number; x: number; y: number; z: number } {
    // Convert to radians
    const azRad = degToRad(azDeg);
    const elRad = degToRad(elDeg);

    // Half angles for quaternion computation
    const halfAz = azRad / 2;
    const halfEl = elRad / 2;

    // Quaternion from yaw (azimuth) and pitch (elevation) - no roll
    const cosHalfAz = Math.cos(halfAz);
    const sinHalfAz = Math.sin(halfAz);
    const cosHalfEl = Math.cos(halfEl);
    const sinHalfEl = Math.sin(halfEl);

    // Quaternion components (swapped X and Y to match IEM convention)
    const w = cosHalfAz * cosHalfEl;
    const x = cosHalfAz * sinHalfEl;  // Elevation affects X
    const y = -sinHalfAz * sinHalfEl; // Combined effect
    const z = sinHalfAz * cosHalfEl;  // Azimuth affects Z

    return { w, x, y, z };
}

