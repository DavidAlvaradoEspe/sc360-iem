/**
 * Web Spatial Audio Encoder
 * Main Application Component
 * 
 * Implements IEM StereoEncoder-like behavior:
 * - Mono WAV → FOA Encoding → Binaural Decoding
 * - Real-time azimuth/elevation control via 2D panner
 * - WXYZ B-format display
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AudioEngine } from './audio/audioEngine';
import { computeWXYZ } from './utils/math';
import { Panner2D } from './ui/Panner2D';
import { QuaternionBars } from './ui/QuaternionBars';
import { Transport } from './ui/Transport';
import { EQToggle } from './ui/EQToggle';
import { PannerReadouts } from './ui/PannerReadouts';
import './App.css';

interface WXYZValues {
  w: number;
  x: number;
  y: number;
  z: number;
}

function App() {
  // Audio engine ref (persistent across renders)
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const initializeStarted = useRef(false);

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [azimuth, setAzimuth] = useState(0);
  const [elevation, setElevation] = useState(0);
  const [wxyz, setWxyz] = useState<WXYZValues>({ w: 0.707, x: 1, y: 0, z: 0 });
  const [eqEnabled, setEqEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize audio engine
  useEffect(() => {
    // Prevent double initialization in React Strict Mode
    if (initializeStarted.current) {
      return;
    }
    initializeStarted.current = true;

    const initAudio = async () => {
      try {
        const engine = new AudioEngine();
        audioEngineRef.current = engine;

        await engine.init({
          onStateChange: (state) => {
            setIsPlaying(state.isPlaying);
            setIsLoaded(state.isLoaded);
            setFileName(state.fileName);
          }
        });

        // Only set initialized if engine is actually ready
        if (engine.isReady()) {
          setIsInitialized(true);
        }
      } catch (err) {
        console.error('Failed to initialize audio engine:', err);
        setError('Failed to initialize audio. Please refresh and try again.');
      }
    };

    initAudio().catch(console.error);

    // Cleanup on unmount
    return () => {
      if (audioEngineRef.current) {
        audioEngineRef.current.dispose();
        audioEngineRef.current = null;
      }
      // Reset flag so next mount can initialize (React Strict Mode)
      initializeStarted.current = false;
    };
  }, []);

  // Update WXYZ when azimuth/elevation changes
  useEffect(() => {
    const values = computeWXYZ(azimuth, elevation);
    setWxyz(values);

    // Update audio engine direction
    audioEngineRef.current?.setDirection(azimuth, elevation);
  }, [azimuth, elevation]);

  // Handle panner movement
  const handlePannerChange = useCallback((az: number, el: number) => {
    setAzimuth(az);
    setElevation(el);
  }, []);

  // Handle play/pause
  const handlePlayPause = useCallback(() => {
    audioEngineRef.current?.togglePlayback();
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback(async (file: File) => {
    setError(null);
    try {
      await audioEngineRef.current?.loadFile(file);
    } catch (err) {
      console.error('Failed to load file:', err);
      setError('Failed to load audio file. Make sure it\'s a valid audio format.');
    }
  }, []);

  // Handle loading default demo audio
  const handleLoadDefault = useCallback(async () => {
    setError(null);
    try {
      await audioEngineRef.current?.loadFromUrl('/audio/Hollow.mp3');
    } catch (err) {
      console.error('Failed to load demo audio:', err);
      setError('Failed to load demo audio.');
    }
  }, []);

  // Handle EQ toggle
  const handleEQToggle = useCallback((enabled: boolean) => {
    setEqEnabled(enabled);
    audioEngineRef.current?.setEQEnabled(enabled);
  }, []);

  if (error) {
    return (
      <div className="app-container">
        <div className="error-message">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="app-container">
        <div className="loading">
          <div className="loading-spinner" />
          <p>Initializing Audio Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">
          <span className="title-suffix">SC360</span>
        </h1>
      </header>

      <main className="app-main">
        <div className="main-layout">
          {/* Left side: 2D Panner */}
          <section className="panner-section">
            <Panner2D
              azimuth={azimuth}
              elevation={elevation}
              onChange={handlePannerChange}
              size={320}
            />
          </section>

          {/* Right side: WXYZ Display */}
          <section className="display-section">
            <PannerReadouts
              azimuth={azimuth}
              elevation={elevation}
              onChange={handlePannerChange}
            />
            <QuaternionBars values={wxyz} />
          </section>
        </div>

        {/* Transport controls */}
        <section className="transport-section">
          <Transport
            isPlaying={isPlaying}
            isLoaded={isLoaded}
            fileName={fileName}
            onPlayPause={handlePlayPause}
            onFileSelect={handleFileSelect}
            onLoadDefault={handleLoadDefault}
          />
          <EQToggle
            enabled={eqEnabled}
            onChange={handleEQToggle}
          />
        </section>
      </main>

      <footer className="app-footer">
        <p>Developed by: David Alvarado - 2026</p>
      </footer>
    </div>
  );
}

export default App;
