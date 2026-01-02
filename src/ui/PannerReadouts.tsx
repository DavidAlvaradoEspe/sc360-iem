import React, { useState, useEffect, useRef } from 'react';
import './PannerReadouts.css';

interface PannerReadoutsProps {
    azimuth: number;
    elevation: number;
    onChange: (azimuth: number, elevation: number) => void;
}

// Parsea string con coma o punto, retorna número o null si inválido
const parseLocaleNumber = (value: string): number | null => {
    const normalized = value.replace(',', '.');
    const num = parseFloat(normalized);
    return isNaN(num) ? null : num;
};

// Formatea número a 2 decimales máximo
const formatValue = (value: number): string => {
    return Number(value.toFixed(2)).toString();
};

export const PannerReadouts: React.FC<PannerReadoutsProps> = ({ azimuth, elevation, onChange }) => {
    const [azimuthText, setAzimuthText] = useState(formatValue(azimuth));
    const [elevationText, setElevationText] = useState(formatValue(elevation));

    const azInputRef = useRef<HTMLInputElement>(null);
    const elInputRef = useRef<HTMLInputElement>(null);

    // Sincronizar con props cuando el input NO tiene focus
    useEffect(() => {
        if (document.activeElement !== azInputRef.current) {
            setAzimuthText(formatValue(azimuth));
        }
    }, [azimuth]);

    useEffect(() => {
        if (document.activeElement !== elInputRef.current) {
            setElevationText(formatValue(elevation));
        }
    }, [elevation]);

    const handleAzimuthBlur = () => {
        const parsed = parseLocaleNumber(azimuthText);
        if (parsed !== null) {
            // Normalizar a rango -180 a 180
            let value = parsed % 360;
            if (value > 180) value -= 360;
            if (value < -180) value += 360;
            const finalValue = Number(value.toFixed(2));
            setAzimuthText(formatValue(finalValue));
            onChange(finalValue, elevation);
        } else {
            // Restaurar valor anterior si es inválido
            setAzimuthText(formatValue(azimuth));
        }
    };

    const handleElevationBlur = () => {
        const parsed = parseLocaleNumber(elevationText);
        if (parsed !== null) {
            // Clamp a 0-90
            const value = Math.max(0, Math.min(90, parsed));
            const finalValue = Number(value.toFixed(2));
            setElevationText(formatValue(finalValue));
            onChange(azimuth, finalValue);
        } else {
            // Restaurar valor anterior si es inválido
            setElevationText(formatValue(elevation));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    return (
        <div className="coordinate-info">
            <div className="info-block">
                <span className="info-label">Azimuth</span>
                <input
                    ref={azInputRef}
                    type="text"
                    className="info-value panner-input"
                    value={azimuthText}
                    onChange={(e) => setAzimuthText(e.target.value)}
                    onBlur={handleAzimuthBlur}
                    onKeyDown={handleKeyDown}
                />
            </div>
            <div className="info-block">
                <span className="info-label">Elevation</span>
                <input
                    ref={elInputRef}
                    type="text"
                    className="info-value panner-input"
                    value={elevationText}
                    onChange={(e) => setElevationText(e.target.value)}
                    onBlur={handleElevationBlur}
                    onKeyDown={handleKeyDown}
                />
            </div>
        </div>
    );
};

export default PannerReadouts;
