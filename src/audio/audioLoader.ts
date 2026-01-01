/**
 * WAV file loading utilities
 */

/**
 * Loads an audio file and decodes it to an AudioBuffer
 * @param file - File object from input element
 * @param audioContext - AudioContext for decoding
 * @returns Promise resolving to AudioBuffer
 */
export async function loadAudioFile(
    file: File,
    audioContext: AudioContext
): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Loads an audio file from a URL and decodes it to an AudioBuffer
 * @param url - URL to fetch audio from
 * @param audioContext - AudioContext for decoding
 * @returns Promise resolving to AudioBuffer
 */
export async function loadAudioFromUrl(
    url: string,
    audioContext: AudioContext
): Promise<AudioBuffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Downmixes a multi-channel AudioBuffer to mono
 * @param buffer - Source AudioBuffer
 * @param audioContext - AudioContext for creating new buffer
 * @returns Mono AudioBuffer
 */
export function downmixToMono(
    buffer: AudioBuffer,
    audioContext: AudioContext
): AudioBuffer {
    if (buffer.numberOfChannels === 1) {
        return buffer;
    }

    const monoBuffer = audioContext.createBuffer(
        1,
        buffer.length,
        buffer.sampleRate
    );
    const monoData = monoBuffer.getChannelData(0);

    // Mix all channels to mono
    const numChannels = buffer.numberOfChannels;
    console.log(numChannels)
    for (let i = 0; i < buffer.length; i++) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
            sum += buffer.getChannelData(ch)[i];
        }
        monoData[i] = sum / numChannels;
    }

    return monoBuffer;
}
