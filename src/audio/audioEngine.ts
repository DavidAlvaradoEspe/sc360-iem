/**
 * Audio Engine for FOA (First Order Ambisonics) encoding and binaural decoding
 * Uses the JSAmbisonics library for encoding and decoding
 */

import { loadAudioFile, loadAudioFromUrl, downmixToMono } from './audioLoader.ts';
import { DirectionalEQ } from './directionalEQ';
// import { loadHOA3_IRC1008 } from './hrirLoader';
// import { loadSofaForAmbisonics } from './sofaLoader';
import { loadHybridSofaForAmbisonics } from './hybridLoader';
import type { SpatialPosition, AudioEngineState, AudioEngineCallbacks } from './types';

// JSAmbisonics types (the library doesn't have TypeScript definitions)
interface MonoEncoder {
    in: GainNode;
    out: GainNode;
    azim: number;
    elev: number;
    updateGains: () => void;
}

interface BinDecoder {
    in: GainNode;
    out: GainNode;
    updateFilters: (hrirBuffer: AudioBuffer) => void;
}

interface Ambisonics {
    monoEncoder: new (ctx: AudioContext, order: number) => MonoEncoder;
    binDecoder: new (ctx: AudioContext, order: number) => BinDecoder;
}

// Dynamic import for ambisonics
let ambisonicsModule: Ambisonics | null = null;

async function loadAmbisonics(): Promise<Ambisonics | null> {
    if (!ambisonicsModule) {
        // @ts-expect-error - ambisonics doesn't have types
        const mod = await import('ambisonics');
        ambisonicsModule = mod.default || mod;
    }
    return ambisonicsModule;
}

export class AudioEngine {
    private audioContext: AudioContext | null = null;
    private encoder: MonoEncoder | null = null;
    private decoder: BinDecoder | null = null;
    private directionalEQ: DirectionalEQ | null = null;
    private sourceNode: AudioBufferSourceNode | null = null;
    private masterGain: GainNode | null = null;
    private audioBuffer: AudioBuffer | null = null;
    private isPlaying = false;
    private fileName: string | null = null;
    private callbacks: AudioEngineCallbacks = {};
    private currentPosition: SpatialPosition = { azimuth: 0, elevation: 0 };
    private disposed = false;
    private initialized = false;

    /**
     * Initializes the audio engine
     */
    async init(callbacks?: AudioEngineCallbacks): Promise<void> {
        if (this.initialized || this.disposed) {
            return;
        }

        if (callbacks) {
            this.callbacks = callbacks;
        }

        // Create AudioContext first
        this.audioContext = new AudioContext();

        // Load ambisonics library (async)
        const ambisonics = await loadAmbisonics();

        // Check if we were disposed during the async load
        if (this.disposed || !this.audioContext || !ambisonics) {
            return;
        }

        // Create FOA encoder (order 1)
        this.encoder = new ambisonics.monoEncoder(this.audioContext, 1);

        // Create directional EQ filter
        this.directionalEQ = new DirectionalEQ(this.audioContext);

        // Create binaural decoder (order 1)
        this.decoder = new ambisonics.binDecoder(this.audioContext, 1);

        // Load Hybrid SOFA HRIR (KU100 with binary IR data) for true binaural spatialization
        try {
            console.log('Loading Hybrid SOFA HRIR filters (KU100)...');
            const hrirBuffer = await loadHybridSofaForAmbisonics(
                this.audioContext,
                '/hrir/KU100meta.json',
                '/hrir/KU100.bin'
            );
            this.decoder.updateFilters(hrirBuffer);
            console.log('✓ Hybrid SOFA HRIR loaded successfully - binaural rendering active');
        } catch (err) {
            console.warn('Failed to load Hybrid SOFA HRIR, using default cardioid filters:', err);
            // Continue with default filters - will work but less realistic
        }

        /*
        // Load SOFA HRIR for true binaural spatialization
        try {
            console.log('Loading SOFA HRIR filters... d5P4');
            const hrirBuffer = await loadSofaForAmbisonics(this.audioContext, '/hrir/D1_KU100_DECIMATED5.json');
            this.decoder.updateFilters(hrirBuffer);
            console.log('✓ SOFA HRIR loaded successfully - binaural rendering active');
        } catch (err) {
            console.warn('Failed to load SOFA HRIR, using default cardioid filters:', err);
            // Continue with default filters - will work but less realistic
        }
        */

        /*
        // Load real HRIR for true binaural spatialization
        try {
            console.log('Loading HRIR filters...');
            const hrirBuffer = await loadHOA3_IRC1008(this.audioContext);
            this.decoder.updateFilters(hrirBuffer);
            console.log('✓ HRIR loaded successfully - binaural rendering active');
        } catch (err) {
            console.warn('Failed to load HRIR, using default cardioid filters:', err);
            // Continue with default filters - will work but less realistic
        }
        */

        // Create channel swap nodes to fix left/right inversion
        // JSAmbisonics uses a coordinate system where left/right is inverted
        const channelSplitter = this.audioContext.createChannelSplitter(2);
        const channelMerger = this.audioContext.createChannelMerger(2);

        // Create master gain for volume control
        this.masterGain = this.audioContext.createGain();
        this.masterGain.gain.value = 0.2; // 2x volume boost

        // Connect encoder → EQ → decoder → splitter → merger (swapped) → master gain → destination
        this.encoder.out.connect(this.directionalEQ.input);
        this.directionalEQ.output.connect(this.decoder.in);
        this.decoder.out.connect(channelSplitter);
        // Swap channels: left (0) → right (1), right (1) → left (0)
        channelSplitter.connect(channelMerger, 0, 1); // Left input → Right output
        channelSplitter.connect(channelMerger, 1, 0); // Right input → Left output
        channelMerger.connect(this.masterGain);
        this.masterGain.connect(this.audioContext.destination);

        // Set initial position
        this.setDirection(0, 0);

        this.initialized = true;
        this.notifyStateChange();
    }

    /**
     * Check if the engine is ready
     */
    isReady(): boolean {
        return this.initialized && !this.disposed && this.audioContext !== null;
    }

    /**
     * Loads an audio file
     */
    async loadFile(file: File): Promise<void> {
        if (!this.audioContext || this.disposed) {
            throw new Error('Audio engine not initialized');
        }

        // Resume context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const buffer = await loadAudioFile(file, this.audioContext);

        // Check if disposed during async operation
        if (this.disposed || !this.audioContext) return;

        this.audioBuffer = downmixToMono(buffer, this.audioContext);
        this.fileName = file.name;
        this.notifyStateChange();
    }

    /**
     * Loads audio from a URL
     */
    async loadFromUrl(url: string): Promise<void> {
        if (!this.audioContext || this.disposed) {
            throw new Error('Audio engine not initialized');
        }

        // Resume context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const buffer = await loadAudioFromUrl(url, this.audioContext);

        // Check if disposed during async operation
        if (this.disposed || !this.audioContext) return;

        this.audioBuffer = downmixToMono(buffer, this.audioContext);
        this.fileName = url.split('/').pop() || 'audio';
        this.notifyStateChange();
    }

    /**
     * Starts audio playback
     */
    play(): void {
        if (!this.audioContext || !this.audioBuffer || !this.encoder || this.disposed) {
            console.warn('Cannot play: audio not ready');
            return;
        }

        // Resume context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch();
        }

        // Stop any existing playback
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch {
                // Ignore errors if already stopped
            }
        }

        // Create new source node (AudioBufferSourceNode is one-shot)
        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.loop = true;

        // Connect to encoder
        this.sourceNode.connect(this.encoder.in);

        // Start playback
        this.sourceNode.start();
        this.isPlaying = true;

        // Handle playback end
        this.sourceNode.onended = () => {
            if (this.isPlaying && !this.disposed) {
                this.isPlaying = false;
                this.notifyStateChange();
            }
        };

        this.notifyStateChange();
    }

    /**
     * Stops audio playback
     */
    stop(): void {
        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
                this.sourceNode.disconnect();
            } catch {
                // Ignore errors if already stopped
            }
            this.sourceNode = null;
        }
        this.isPlaying = false;
        if (!this.disposed) {
            this.notifyStateChange();
        }
    }

    /**
     * Toggles play/pause
     */
    togglePlayback(): void {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    /**
     * Sets the spatial direction (azimuth and elevation)
     */
    setDirection(azimuth: number, elevation: number): void {
        if (!this.encoder || this.disposed) return;

        this.currentPosition = { azimuth, elevation };

        // Update encoder parameters
        // Negate azimuth to invert left/right audio direction
        this.encoder.azim = -azimuth;
        this.encoder.elev = elevation;
        this.encoder.updateGains();

        // Update directional EQ based on azimuth
        if (this.directionalEQ) {
            this.directionalEQ.updateDirection(azimuth);
        }
    }

    /**
     * Sets the master volume
     */
    setVolume(volume: number): void {
        if (this.masterGain && !this.disposed) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Enable or disable the directional EQ filter
     */
    setEQEnabled(enabled: boolean): void {
        if (this.directionalEQ && !this.disposed) {
            this.directionalEQ.setEnabled(enabled);
        }
    }

    /**
     * Returns current playback state
     */
    getState(): AudioEngineState {
        return {
            isPlaying: this.isPlaying,
            isLoaded: this.audioBuffer !== null,
            fileName: this.fileName,
        };
    }

    /**
     * Returns current spatial position
     */
    getPosition(): SpatialPosition {
        return { ...this.currentPosition };
    }

    /**
     * Cleans up resources
     */
    dispose(): void {
        if (this.disposed) return;

        this.disposed = true;
        this.stop();

        if (this.directionalEQ) {
            this.directionalEQ.dispose();
            this.directionalEQ = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.encoder = null;
        this.decoder = null;
        this.masterGain = null;
        this.audioBuffer = null;
        this.initialized = false;
    }

    private notifyStateChange(): void {
        if (this.callbacks.onStateChange && !this.disposed) {
            this.callbacks.onStateChange(this.getState());
        }
    }
}

// Singleton instance for use across the app
let audioEngineInstance: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
    if (!audioEngineInstance || !audioEngineInstance.isReady()) {
        audioEngineInstance = new AudioEngine();
    }
    return audioEngineInstance;
}

export function disposeAudioEngine(): void {
    if (audioEngineInstance) {
        audioEngineInstance.dispose();
        audioEngineInstance = null;
    }
}
