/**
 * Transport Controls Component
 * Play/Pause button and file loading controls
 */

import React, { useRef } from 'react';
import './Transport.css';

interface TransportProps {
    isPlaying: boolean;
    isLoaded: boolean;
    fileName: string | null;
    onPlayPause: () => void;
    onFileSelect: (file: File) => void;
    onLoadDefault?: () => void;
}

export const Transport: React.FC<TransportProps> = ({
    isPlaying,
    isLoaded,
    fileName,
    onPlayPause,
    onFileSelect,
    onLoadDefault,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            onFileSelect(file);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    return (
        <div className="transport">
            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.wav,.mp3,.ogg,.flac,.aac"
                onChange={handleFileChange}
                className="transport-file-input"
            />

            {/* File info */}
            <div className="transport-file-info">
                <div className="file-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                    </svg>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="audio-icon">
                        <path d="M12 2v20M17 5v14M7 5v14M2 9v6M22 9v6" strokeLinecap="round" />
                    </svg>
                </div>
                <div className="file-details">
                    {fileName ? (
                        <>
                            <span className="file-name">{fileName}</span>
                            <span className="file-status">Ready to play</span>
                        </>
                    ) : (
                        <>
                            <span className="file-name">No file loaded</span>
                            <span className="file-status">Select a WAV file</span>
                        </>
                    )}
                </div>
            </div>

            {/* Control buttons */}
            <div className="transport-controls">
                {/* Load file button */}
                <button
                    className="transport-button load-button"
                    onClick={handleFileClick}
                    title="Load audio file"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                    <span>Load</span>
                </button>

                {/* Load default audio button */}
                {onLoadDefault && (
                    <button
                        className="transport-button demo-button"
                        onClick={onLoadDefault}
                        title="Load demo audio"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77" />
                            <circle cx="12" cy="12" r="10" />
                            <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                        </svg>
                        <span>Demo</span>
                    </button>
                )}

                {/* Play/Pause button */}
                <button
                    className={`transport-button play-button ${isPlaying ? 'playing' : ''} ${!isLoaded ? 'disabled' : ''}`}
                    onClick={onPlayPause}
                    disabled={!isLoaded}
                    title={isPlaying ? 'Pause' : 'Play'}
                >
                    {isPlaying ? (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="6 4 20 12 6 20 6 4" />
                        </svg>
                    )}
                </button>
            </div>
        </div>
    );
};

export default Transport;
