/**
 * SOFA (Spatially Oriented Format for Acoustics) Loader
 * Loads HRIR data from SOFA JSON format for binaural rendering
 *
 * SOFA JSON structure:
 * - leaves[]: Array of data sections
 *   - SourcePosition: [M, 3] - azimuth, elevation, distance for each measurement
 *   - Data.IR: [M, R, N] - impulse responses (M=measurements, R=receivers/ears, N=samples)
 *   - Data.SamplingRate: [1] - sample rate
 */

/**
 * SOFA JSON structure types
 */
interface SofaLeaf {
    name: string;
    type: string;
    shape?: number[];
    value?: number[] | number[][] | number[][][];
    data?: number[] | number[][] | number[][][];  // Some SOFA JSON files use 'data' instead of 'value'
    attributes?: { name: string; value: unknown }[];
}

interface SofaJson {
    name: string;
    leaves: SofaLeaf[];
}

/**
 * Parsed SOFA data structure
 */
export interface SofaData {
    /** Sample rate of the HRIRs */
    sampleRate: number;
    /** Number of measurement positions */
    numPositions: number;
    /** HRIR length in samples */
    hrirLength: number;
    /** Source positions [azimuth, elevation, distance] for each measurement */
    sourcePositions: number[][];
    /** Left ear impulse responses */
    irLeft: Float32Array<ArrayBuffer>[];
    /** Right ear impulse responses */
    irRight: Float32Array<ArrayBuffer>[];
}

/**
 * Find a leaf by name in the SOFA JSON structure
 */
function findLeaf(leaves: SofaLeaf[], name: string): SofaLeaf | undefined {
    return leaves.find(leaf => leaf.name === name);
}

/**
 * Load and parse SOFA JSON file from URL
 * @param url - URL to SOFA JSON file
 * @returns Parsed SOFA data
 */
export async function loadSofaJson(url: string): Promise<SofaData> {
    console.log(`Loading SOFA file from: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch SOFA file: ${response.statusText}`);
    }

    const json: SofaJson = await response.json();
    console.log(`SOFA file: ${json.name}`);

    // Extract data from leaves
    const irLeaf = findLeaf(json.leaves, 'Data.IR');
    const sourcePositionLeaf = findLeaf(json.leaves, 'SourcePosition');
    const sampleRateLeaf = findLeaf(json.leaves, 'Data.SamplingRate');

    // Helper to get data from leaf (some SOFA files use 'data', others use 'value')
    const getLeafData = (leaf: SofaLeaf | undefined) => leaf?.data ?? leaf?.value;

    const irData = getLeafData(irLeaf);
    const sourcePositionData = getLeafData(sourcePositionLeaf);
    const sampleRateData = getLeafData(sampleRateLeaf);

    if (!irData || !irLeaf?.shape) {
        throw new Error('SOFA file missing Data.IR');
    }
    if (!sourcePositionData) {
        throw new Error('SOFA file missing SourcePosition');
    }
    if (!sampleRateData) {
        throw new Error('SOFA file missing Data.SamplingRate');
    }

    const [numPositions, numReceivers, hrirLength] = irLeaf.shape;
    const sampleRate = Array.isArray(sampleRateData)
        ? (sampleRateData as number[])[0]
        : sampleRateData as number;

    console.log(`SOFA data: ${numPositions} positions, ${numReceivers} receivers, ${hrirLength} samples @ ${sampleRate}Hz`);

    // Parse source positions (azimuth, elevation, distance)
    const sourcePositions = sourcePositionData as number[][];

    // Parse IR data - shape is [M, R, N] (measurements, receivers, samples)
    const irDataArray = irData as number[][][];
    const irLeft: Float32Array<ArrayBuffer>[] = [];
    const irRight: Float32Array<ArrayBuffer>[] = [];

    for (let m = 0; m < numPositions; m++) {
        // Left ear (receiver 0)
        irLeft.push(new Float32Array(irDataArray[m][0]) as Float32Array<ArrayBuffer>);
        // Right ear (receiver 1)
        irRight.push(new Float32Array(irDataArray[m][1]) as Float32Array<ArrayBuffer>);
    }

    return {
        sampleRate,
        numPositions,
        hrirLength,
        sourcePositions,
        irLeft,
        irRight
    };
}

/**
 * Find the nearest HRIR for a given azimuth and elevation
 * Uses angular distance to find the closest measurement position
 *
 * @param sofaData - Loaded SOFA data
 * @param azimuth - Target azimuth in degrees (-180 to 180, 0 = front)
 * @param elevation - Target elevation in degrees (-90 to 90, 0 = horizontal)
 * @returns Index of the nearest HRIR
 */
export function findNearestHRIR(
    sofaData: SofaData,
    azimuth: number,
    elevation: number
): number {
    let minDistance = Infinity;
    let nearestIndex = 0;

    // Normalize azimuth to 0-360 range (SOFA typically uses this convention)
    const targetAz = ((azimuth % 360) + 360) % 360;

    for (let i = 0; i < sofaData.numPositions; i++) {
        const pos = sofaData.sourcePositions[i];
        const az = pos[0];
        const el = pos[1];

        // Calculate angular distance using spherical geometry
        // Convert to radians
        const az1 = (targetAz * Math.PI) / 180;
        const az2 = (az * Math.PI) / 180;
        const el1 = (elevation * Math.PI) / 180;
        const el2 = (el * Math.PI) / 180;

        // Haversine-like formula for angular distance
        const dAz = az2 - az1;
        const dEl = el2 - el1;
        const a = Math.sin(dEl / 2) ** 2 +
                  Math.cos(el1) * Math.cos(el2) * Math.sin(dAz / 2) ** 2;
        const distance = 2 * Math.asin(Math.sqrt(a));

        if (distance < minDistance) {
            minDistance = distance;
            nearestIndex = i;
        }
    }

    return nearestIndex;
}

/**
 * Create an AudioBuffer containing HRIRs for binaural rendering
 * This creates a format compatible with JSAmbisonics binDecoder
 *
 * For FOA (First Order Ambisonics), we need 4 channels of HRIRs:
 * - Channel 0: W (omnidirectional)
 * - Channel 1: Y (left-right)
 * - Channel 2: Z (up-down)
 * - Channel 3: X (front-back)
 *
 * Each channel has stereo HRIRs interleaved
 *
 * @param audioContext - Web Audio API context
 * @param sofaData - Loaded SOFA data
 * @returns AudioBuffer formatted for JSAmbisonics
 */
export async function createAmbisonicHRIRBuffer(
    audioContext: AudioContext,
    sofaData: SofaData
): Promise<AudioBuffer> {
    // For FOA, we need HRIRs at specific directions for the 4 spherical harmonics
    // W: omnidirectional - use front position (0°, 0°)
    // X: front-back - use front (0°, 0°) and back (180°, 0°)
    // Y: left-right - use left (90°, 0°) and right (-90°, 0°)
    // Z: up-down - use up (0°, 90°) and down (0°, -90°)

    // Find indices for cardinal directions
    const frontIdx = findNearestHRIR(sofaData, 0, 0);
    const backIdx = findNearestHRIR(sofaData, 180, 0);
    const leftIdx = findNearestHRIR(sofaData, 90, 0);
    const rightIdx = findNearestHRIR(sofaData, -90, 0);
    const upIdx = findNearestHRIR(sofaData, 0, 90);
    const downIdx = findNearestHRIR(sofaData, 0, -90);

    console.log('Selected HRIR positions:', {
        front: sofaData.sourcePositions[frontIdx],
        back: sofaData.sourcePositions[backIdx],
        left: sofaData.sourcePositions[leftIdx],
        right: sofaData.sourcePositions[rightIdx],
        up: sofaData.sourcePositions[upIdx],
        down: sofaData.sourcePositions[downIdx]
    });

    // JSAmbisonics expects a specific format:
    // For FOA order 1: 4 channels, each containing stereo HRIR pairs
    // The buffer should have (order+1)^2 * 2 = 8 channels for stereo output

    // Check if we need to resample (SOFA sample rate != AudioContext sample rate)
    const contextSampleRate = audioContext.sampleRate;
    const sofaSampleRate = sofaData.sampleRate;
    const needsResampling = contextSampleRate !== sofaSampleRate;

    if (needsResampling) {
        console.log(`Resampling HRIR from ${sofaSampleRate}Hz to ${contextSampleRate}Hz`);
    }

    // Calculate new buffer length if resampling
    const resampleRatio = contextSampleRate / sofaSampleRate;
    const outputLength = needsResampling
        ? Math.ceil(sofaData.hrirLength * resampleRatio)
        : sofaData.hrirLength;

    // Create buffer with 8 channels (4 harmonics * 2 ears)
    const numChannels = 8;
    const buffer = audioContext.createBuffer(
        numChannels,
        outputLength,
        contextSampleRate  // Use context sample rate, not SOFA sample rate
    );

    // Helper function to resample a Float32Array using linear interpolation
    const resample = (input: Float32Array<ArrayBuffer>, outputLen: number): Float32Array<ArrayBuffer> => {
        if (!needsResampling) return input;

        const output = new Float32Array(outputLen) as Float32Array<ArrayBuffer>;
        const ratio = (input.length - 1) / (outputLen - 1);

        for (let i = 0; i < outputLen; i++) {
            const srcIdx = i * ratio;
            const srcIdxFloor = Math.floor(srcIdx);
            const srcIdxCeil = Math.min(srcIdxFloor + 1, input.length - 1);
            const t = srcIdx - srcIdxFloor;

            // Linear interpolation
            output[i] = input[srcIdxFloor] * (1 - t) + input[srcIdxCeil] * t;
        }

        return output;
    };

    // Fill buffer with HRIRs for each spherical harmonic (with resampling if needed)
    // Channel 0: W left, Channel 1: W right (use front HRIR)
    buffer.copyToChannel(resample(sofaData.irLeft[frontIdx], outputLength), 0);
    buffer.copyToChannel(resample(sofaData.irRight[frontIdx], outputLength), 1);

    // Channel 2: Y left, Channel 3: Y right (use left HRIR for positive Y)
    buffer.copyToChannel(resample(sofaData.irLeft[leftIdx], outputLength), 2);
    buffer.copyToChannel(resample(sofaData.irRight[leftIdx], outputLength), 3);

    // Channel 4: Z left, Channel 5: Z right (use up HRIR)
    buffer.copyToChannel(resample(sofaData.irLeft[upIdx], outputLength), 4);
    buffer.copyToChannel(resample(sofaData.irRight[upIdx], outputLength), 5);

    // Channel 6: X left, Channel 7: X right (use front HRIR for positive X)
    buffer.copyToChannel(resample(sofaData.irLeft[frontIdx], outputLength), 6);
    buffer.copyToChannel(resample(sofaData.irRight[frontIdx], outputLength), 7);

    console.log('Created Ambisonic HRIR buffer:', {
        channels: numChannels,
        length: buffer.length,
        sampleRate: buffer.sampleRate,
        duration: buffer.duration,
        resampled: needsResampling
    });

    return buffer;
}

/**
 * Load SOFA file and create AudioBuffer for JSAmbisonics
 * Convenience function that combines loading and conversion
 *
 * @param audioContext - Web Audio API context
 * @param url - URL to SOFA JSON file (default: D1_KU100_DECIMATED.json)
 * @returns AudioBuffer formatted for JSAmbisonics binDecoder
 */
export async function loadSofaForAmbisonics(
    audioContext: AudioContext,
    url: string = '/hrir/D1_KU100_DECIMATED.json'
): Promise<AudioBuffer> {
    const sofaData = await loadSofaJson(url);
    return createAmbisonicHRIRBuffer(audioContext, sofaData);
}

/**
 * Get HRIR pair for a specific direction (for direct convolution)
 *
 * @param sofaData - Loaded SOFA data
 * @param azimuth - Azimuth in degrees
 * @param elevation - Elevation in degrees
 * @returns Object with left and right ear impulse responses
 */
export function getHRIRForDirection(
    sofaData: SofaData,
    azimuth: number,
    elevation: number
): { left: Float32Array; right: Float32Array } {
    const idx = findNearestHRIR(sofaData, azimuth, elevation);
    return {
        left: sofaData.irLeft[idx],
        right: sofaData.irRight[idx]
    };
}

