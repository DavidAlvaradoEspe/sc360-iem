// Audio-related type definitions

export interface SpatialPosition {
    azimuth: number;  // degrees, -180 to 180
    elevation: number; // degrees, -90 to 90
}

export interface WXYZValues {
    w: number;
    x: number;
    y: number;
    z: number;
}

export interface AudioEngineState {
    isPlaying: boolean;
    isLoaded: boolean;
    fileName: string | null;
}

export interface AudioEngineCallbacks {
    onStateChange?: (state: AudioEngineState) => void;
    onWXYZChange?: (values: WXYZValues) => void;
}
