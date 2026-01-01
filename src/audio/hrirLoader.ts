/**
 * HRIR (Head-Related Impulse Response) Loader
 * Loads binaural filters for realistic spatial audio rendering
 */

/**
 * Load HRIR audio buffer from URL
 * @param audioContext - Web Audio API context
 * @param url - URL to HRIR WAV file
 * @returns AudioBuffer containing HRIR data
 */
export async function loadHRIR(
    audioContext: AudioContext,
    url: string
): Promise<AudioBuffer> {
    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to fetch HRIR: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        console.log(`HRIR loaded: ${url}`, {
            channels: audioBuffer.numberOfChannels,
            length: audioBuffer.length,
            sampleRate: audioBuffer.sampleRate,
            duration: audioBuffer.duration
        });

        return audioBuffer;
    } catch (error) {
        console.error('Failed to load HRIR:', error);
        throw error;
    }
}

/**
 * Load HOA3 IRC 1008 HRIR set (2 files for 16 channels)
 * This is the recommended HRIR set for JSAmbisonics binDecoder
 * 
 * @param audioContext - Web Audio API context
 * @returns Combined AudioBuffer with all 16 channels
 */
export async function loadHOA3_IRC1008(
    audioContext: AudioContext
): Promise<AudioBuffer> {
    // Load both channel sets
    const [buffer1_8, buffer9_16] = await Promise.all([
        loadHRIR(audioContext, '/hrir/HOA3_IRC_1008_virtual_01-08ch.wav'),
        loadHRIR(audioContext, '/hrir/HOA3_IRC_1008_virtual_09-16ch.wav')
    ]);

    // For FOA (First Order Ambisonics), we only need 4 channels
    // But we'll load all 16 for potential future use with higher orders

    // Create a combined buffer with all 16 channels
    const totalChannels = buffer1_8.numberOfChannels + buffer9_16.numberOfChannels;
    const combinedBuffer = audioContext.createBuffer(
        totalChannels,
        buffer1_8.length,
        buffer1_8.sampleRate
    );

    // Copy channels from first buffer (1-8)
    for (let ch = 0; ch < buffer1_8.numberOfChannels; ch++) {
        combinedBuffer.copyToChannel(buffer1_8.getChannelData(ch), ch);
    }

    // Copy channels from second buffer (9-16)
    for (let ch = 0; ch < buffer9_16.numberOfChannels; ch++) {
        combinedBuffer.copyToChannel(
            buffer9_16.getChannelData(ch),
            buffer1_8.numberOfChannels + ch
        );
    }

    console.log('Combined HRIR buffer created:', {
        totalChannels,
        length: combinedBuffer.length,
        duration: combinedBuffer.duration
    });

    return combinedBuffer;
}
