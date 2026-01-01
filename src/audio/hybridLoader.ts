/**
 * Hybrid SOFA Loader for Binary + JSON Metadata
 * Loads HRIR data from separate metadata JSON and binary IR files
 *
 * This approach is more efficient for large SOFA files:
 * - Metadata JSON contains positions, sample rate, etc.
 * - Binary file contains raw Float32 IR data
 *
 * Compatible with KU100meta.json + KU100.bin format
 */

/**
 * SOFA JSON structure types (same as sofaLoader)
 */
interface SofaLeaf {
    name: string;
    type: string;
    shape?: number[];
    value?: number[] | number[][] | number[][][];
    data?: number[] | number[][] | number[][][];
    bin_filename?: string;  // For binary reference
    attributes?: { name: string; value: unknown }[];
}

interface SofaJson {
    name: string;
    leaves: SofaLeaf[];
}

/**
 * Parsed SOFA data structure
 */
export interface HybridSofaData {
    /** Sample rate of the HRIRs */
    sampleRate: number;
    /** Number of measurement positions */
    numPositions: number;
    /** HRIR length in samples */
    hrirLength: number;
    /** Number of receivers (ears) */
    numReceivers: number;
    /** Source positions [azimuth, elevation, distance] for each measurement */
    sourcePositions: number[][];
    /** Left ear impulse responses */
    irLeft: Float32Array[];
    /** Right ear impulse responses */
    irRight: Float32Array[];
}

/**
 * Find a leaf by name in the SOFA JSON structure
 */
function findLeaf(leaves: SofaLeaf[], name: string): SofaLeaf | undefined {
    return leaves.find(leaf => leaf.name === name);
}

/**
 * Load and parse Hybrid SOFA (JSON metadata + Binary IR data)
 * @param metadataUrl - URL to SOFA JSON metadata file
 * @param binUrl - URL to binary IR data file
 * @returns Parsed SOFA data with IR data
 */
export async function loadHybridSofa(
    metadataUrl: string,
    binUrl: string
): Promise<HybridSofaData> {
    console.log(`Loading Hybrid SOFA from: ${metadataUrl} + ${binUrl}`);

    // 1. Fetch both files in parallel
    const [metaRes, binRes] = await Promise.all([
        fetch(metadataUrl),
        fetch(binUrl)
    ]);

    if (!metaRes.ok) {
        throw new Error(`Failed to fetch SOFA metadata: ${metaRes.statusText}`);
    }
    if (!binRes.ok) {
        throw new Error(`Failed to fetch SOFA binary: ${binRes.statusText}`);
    }

    const sofaJson: SofaJson = await metaRes.json();
    const arrayBuffer = await binRes.arrayBuffer();

    console.log(`Hybrid SOFA file: ${sofaJson.name}`);

    // 2. Extract metadata from leaves
    const irLeaf = findLeaf(sofaJson.leaves, 'Data.IR');
    const sourcePositionLeaf = findLeaf(sofaJson.leaves, 'SourcePosition');
    const sampleRateLeaf = findLeaf(sofaJson.leaves, 'Data.SamplingRate');

    // Helper to get data from leaf (some SOFA files use 'data', others use 'value')
    const getLeafData = (leaf: SofaLeaf | undefined) => leaf?.data ?? leaf?.value;

    if (!irLeaf?.shape) {
        throw new Error('SOFA metadata missing Data.IR shape');
    }

    const sourcePositionData = getLeafData(sourcePositionLeaf);
    const sampleRateData = getLeafData(sampleRateLeaf);

    if (!sourcePositionData) {
        throw new Error('SOFA file missing SourcePosition');
    }
    if (!sampleRateData) {
        throw new Error('SOFA file missing Data.SamplingRate');
    }

    // 3. Parse shape [M, R, N] - Measurements, Receivers, Samples
    const [numPositions, numReceivers, hrirLength] = irLeaf.shape;
    const sampleRate = Array.isArray(sampleRateData)
        ? (sampleRateData as number[])[0]
        : sampleRateData as number;

    console.log(`Hybrid SOFA data: ${numPositions} positions, ${numReceivers} receivers, ${hrirLength} samples @ ${sampleRate}Hz`);

    // 4. Convert binary ArrayBuffer to Float32Array
    // The binary file contains Float32 values for all IR data
    const rawData = new Float32Array(arrayBuffer);

    // Verify data size matches expected shape
    const expectedSize = numPositions * numReceivers * hrirLength;
    if (rawData.length !== expectedSize) {
        console.warn(`Binary data size mismatch. Expected ${expectedSize}, got ${rawData.length}`);
    }

    // 5. Reshape flat array into [M][R][N] and extract left/right channels
    const irLeft: Float32Array[] = [];
    const irRight: Float32Array[] = [];

    for (let m = 0; m < numPositions; m++) {
        // Calculate offset for this measurement
        const measurementOffset = m * numReceivers * hrirLength;

        // Left ear (receiver 0)
        const leftOffset = measurementOffset;
        const leftSamples = new Float32Array(hrirLength);
        for (let n = 0; n < hrirLength; n++) {
            leftSamples[n] = rawData[leftOffset + n];
        }
        irLeft.push(leftSamples);

        // Right ear (receiver 1)
        const rightOffset = measurementOffset + hrirLength;
        const rightSamples = new Float32Array(hrirLength);
        for (let n = 0; n < hrirLength; n++) {
            rightSamples[n] = rawData[rightOffset + n];
        }
        irRight.push(rightSamples);
    }

    // Parse source positions
    const sourcePositions = sourcePositionData as number[][];

    console.log(`✓ Hybrid SOFA loaded: ${irLeft.length} HRIRs parsed`);

    return {
        sampleRate,
        numPositions,
        hrirLength,
        numReceivers,
        sourcePositions,
        irLeft,
        irRight
    };
}

/**
 * Find the nearest HRIR for a given azimuth and elevation
 * Uses angular distance to find the closest measurement position
 *
 * @param sofaData - Loaded Hybrid SOFA data
 * @param azimuth - Target azimuth in degrees (-180 to 180, 0 = front)
 * @param elevation - Target elevation in degrees (-90 to 90, 0 = horizontal)
 * @returns Index of the nearest HRIR
 */
export function findNearestHRIR(
    sofaData: HybridSofaData,
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
 * @param sofaData - Loaded Hybrid SOFA data
 * @returns AudioBuffer formatted for JSAmbisonics
 */
export async function createAmbisonicHRIRBuffer(
    audioContext: AudioContext,
    sofaData: HybridSofaData
): Promise<AudioBuffer> {
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
    const resample = (input: Float32Array, outputLen: number): Float32Array<ArrayBuffer> => {
        if (!needsResampling) return input as Float32Array<ArrayBuffer>;

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
 * Load Hybrid SOFA files and create AudioBuffer for JSAmbisonics
 * Convenience function that combines loading and conversion
 *
 * @param audioContext - Web Audio API context
 * @param metadataUrl - URL to SOFA JSON metadata file (default: /hrir/KU100meta.json)
 * @param binUrl - URL to binary IR data file (default: /hrir/KU100.bin)
 * @returns AudioBuffer formatted for JSAmbisonics binDecoder
 */
export async function loadHybridSofaForAmbisonics(
    audioContext: AudioContext,
    metadataUrl: string = '/hrir/KU100meta.json',
    binUrl: string = '/hrir/KU100.bin'
): Promise<AudioBuffer> {
    const sofaData = await loadHybridSofa(metadataUrl, binUrl);
    return createAmbisonicHRIRBuffer(audioContext, sofaData);
}



