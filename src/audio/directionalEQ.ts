/**
 * Directional EQ Filter
 * Enhances front/back spatial perception through azimuth-dependent filtering
 *
 * Based on psychoacoustic research:
 * - Front sounds (0°) have more high-frequency content (brighter, open)
 * - Back sounds (180°) have reduced high-frequency content and more low-end (duller, muffled/cave-like)
 * - Critical frequency range: 3-9 kHz for highs, 200-400 Hz for lows
 */

export class DirectionalEQ {
    private audioContext: AudioContext;
    private inputNode: GainNode;
    private outputNode: GainNode;
    private highShelfFilter: BiquadFilterNode;
    private lowShelfFilter: BiquadFilterNode;  // New: for cave-like effect on back sounds
    private enabled = false;
    private currentAzimuth = 0;

    // EQ parameters optimized for subtle, transparent spatial enhancement
    // High shelf: reduces brightness for back sounds
    private readonly HIGH_SHELF_FREQUENCY = 8000; // 8 kHz (air/brilliance - less volume change perception)
    private readonly HIGH_SHELF_MAX_GAIN_DB = 7; // ±2.5 dB boost/cut

    // Low shelf: adds warmth/boominess for back sounds (cave effect)
    private readonly LOW_SHELF_FREQUENCY = 200; // 200 Hz (sub-bass rumble - cave resonance)
    private readonly LOW_SHELF_MAX_GAIN_DB = 8; // 0 to +1.5 dB

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext;

        // Create input/output nodes
        this.inputNode = audioContext.createGain();
        this.outputNode = audioContext.createGain();

        // Create high-shelf filter (brightness control)
        this.highShelfFilter = audioContext.createBiquadFilter();
        this.highShelfFilter.type = 'highshelf';
        this.highShelfFilter.frequency.value = this.HIGH_SHELF_FREQUENCY;
        this.highShelfFilter.gain.value = 0; // Start neutral

        // Create low-shelf filter (warmth/cave effect)
        this.lowShelfFilter = audioContext.createBiquadFilter();
        this.lowShelfFilter.type = 'lowshelf';
        this.lowShelfFilter.frequency.value = this.LOW_SHELF_FREQUENCY;
        this.lowShelfFilter.gain.value = 0; // Start neutral

        // Connect: input → highShelf → lowShelf → output
        this.inputNode.connect(this.highShelfFilter);
        this.highShelfFilter.connect(this.lowShelfFilter);
        this.lowShelfFilter.connect(this.outputNode);
    }

    /**
     * Update filter gains based on azimuth
     *
     * High shelf (brightness):
     *   Front (0°) = +3 dB (bright, open)
     *   Back (180°) = -3 dB (dull, muffled)
     *
     * Low shelf (warmth/cave):
     *   Front (0°) = 0 dB (neutral)
     *   Back (180°) = +2 dB (warmer, cave-like)
     */
    updateDirection(azimuth: number): void {
        if (!this.enabled) return;

        this.currentAzimuth = azimuth;

        // Convert azimuth to radians
        const azimuthRad = (azimuth * Math.PI) / 180;

        // High shelf: cosine curve, +gain at front, -gain at back
        // cos(0°) = 1 → +3 dB (bright)
        // cos(180°) = -1 → -3 dB (dull)
        const highGainDB = this.HIGH_SHELF_MAX_GAIN_DB * Math.cos(azimuthRad);

        // Low shelf: only boost for back sounds (cave effect)
        // Use (1 - cos) / 2 to get 0 at front, 1 at back
        // Front (0°): (1 - 1) / 2 = 0 → 0 dB
        // Back (180°): (1 - (-1)) / 2 = 1 → +2 dB
        const backFactor = (1 - Math.cos(azimuthRad)) / 2;
        const lowGainDB = this.LOW_SHELF_MAX_GAIN_DB * backFactor;

        // Apply gains smoothly to avoid clicks
        const now = this.audioContext.currentTime;
        const smoothTime = 0.1; // 100ms smooth transition

        this.highShelfFilter.gain.setTargetAtTime(highGainDB, now, smoothTime);
        this.lowShelfFilter.gain.setTargetAtTime(lowGainDB, now, smoothTime);
    }

    /**
     * Enable or disable the EQ filter
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;

        const now = this.audioContext.currentTime;
        const smoothTime = 0.1;

        if (enabled) {
            // Re-apply current azimuth
            this.updateDirection(this.currentAzimuth);
        } else {
            // Reset both filters to neutral (0 dB)
            this.highShelfFilter.gain.setTargetAtTime(0, now, smoothTime);
            this.lowShelfFilter.gain.setTargetAtTime(0, now, smoothTime);
        }
    }

    /**
     * Get enabled state
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Get input node for audio graph connection
     */
    get input(): AudioNode {
        return this.inputNode;
    }

    /**
     * Get output node for audio graph connection
     */
    get output(): AudioNode {
        return this.outputNode;
    }

    /**
     * Cleanup resources
     */
    dispose(): void {
        this.inputNode.disconnect();
        this.highShelfFilter.disconnect();
        this.lowShelfFilter.disconnect();
        this.outputNode.disconnect();
    }
}
