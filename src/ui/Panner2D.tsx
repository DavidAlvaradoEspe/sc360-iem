/**
 * 2D Circular Panner Component
 * Provides interactive azimuth/elevation control via pointer drag
 */

import React, { useRef, useCallback, useState } from 'react';
import { pointToAzEl, azElToPoint } from '../utils/math';
import { rafThrottle } from '../utils/throttle';
import './Panner2D.css';

interface Panner2DProps {
    azimuth: number;
    elevation: number;
    onChange: (azimuth: number, elevation: number) => void;
    size?: number;
}

export const Panner2D: React.FC<Panner2DProps> = ({
    azimuth,
    elevation,
    onChange,
    size = 300,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const radius = (size - 40) / 2; // Leave padding for labels

    // Add padding for labels and calculate viewBox size
    const padding = 40;
    const viewBoxSize = size + padding * 2;
    const adjustedCenter = size / 2 + padding;

    // Calculate dot position from azimuth/elevation
    const dotPos = azElToPoint(azimuth, elevation, radius);

    // Throttled position update
    const throttledOnChange = useCallback(
        rafThrottle((az: number, el: number) => {
            onChange(az, el);
        }),
        [onChange]
    );

    const handlePointerEvent = useCallback((e: React.PointerEvent | PointerEvent) => {
        if (!svgRef.current) return;

        const rect = svgRef.current.getBoundingClientRect();
        // Map from display coordinates to viewBox coordinates
        const scale = viewBoxSize / size;
        const x = (e.clientX - rect.left) * scale - adjustedCenter;
        const y = (e.clientY - rect.top) * scale - adjustedCenter;

        const { azDeg, elDeg } = pointToAzEl(x, y, radius);
        throttledOnChange(azDeg, elDeg);
    }, [viewBoxSize, size, adjustedCenter, radius, throttledOnChange]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();

        // Quitar focus de cualquier input activo (para que PannerReadouts se actualice)
        if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }

        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        handlePointerEvent(e);
    }, [handlePointerEvent]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging) return;
        handlePointerEvent(e);
    }, [isDragging, handlePointerEvent]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        setIsDragging(false);
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    }, []);

    // Keyboard accessibility
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const step = 5;
        let newAz = azimuth;
        let newEl = elevation;

        switch (e.key) {
            case 'ArrowLeft':
                newAz -= step;
                break;
            case 'ArrowRight':
                newAz += step;
                break;
            case 'ArrowUp':
                newEl = Math.min(90, elevation + step);
                break;
            case 'ArrowDown':
                newEl = Math.max(0, elevation - step);
                break;
            default:
                return;
        }
        e.preventDefault();
        onChange(newAz, newEl);
    }, [azimuth, elevation, onChange]);

    // Ring radii with exponential spacing (more space between outer rings)
    // Using squared distribution for better visual balance
    const rings = [0.3, 0.5, 0.65, 0.78, 0.89, 1.0].map(r => r * radius);

    return (
        <div className="panner-container">
            <svg
                ref={svgRef}
                width={size}
                height={size}
                viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
                className={`panner-svg ${isDragging ? 'dragging' : ''}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onKeyDown={handleKeyDown}
                tabIndex={0}
                role="slider"
                aria-label="Spatial panner"
                aria-valuetext={`Azimuth: ${azimuth.toFixed(1)}°, Elevation: ${elevation.toFixed(1)}°`}
            >
                {/* Background */}
                <circle
                    cx={adjustedCenter}
                    cy={adjustedCenter}
                    r={radius}
                    className="panner-background"
                />

                {/* Concentric rings */}
                {rings.map((r, i) => (
                    <circle
                        key={i}
                        cx={adjustedCenter}
                        cy={adjustedCenter}
                        r={r}
                        className="panner-ring"
                    />
                ))}

                {/* Crosshair */}
                <line
                    x1={adjustedCenter - radius}
                    y1={adjustedCenter}
                    x2={adjustedCenter + radius}
                    y2={adjustedCenter}
                    className="panner-crosshair"
                />
                <line
                    x1={adjustedCenter}
                    y1={adjustedCenter - radius}
                    x2={adjustedCenter}
                    y2={adjustedCenter + radius}
                    className="panner-crosshair"
                />

                {/* Diagonal lines at 45° */}
                <line
                    x1={adjustedCenter - radius * Math.cos(Math.PI / 4)}
                    y1={adjustedCenter - radius * Math.sin(Math.PI / 4)}
                    x2={adjustedCenter + radius * Math.cos(Math.PI / 4)}
                    y2={adjustedCenter + radius * Math.sin(Math.PI / 4)}
                    className="panner-crosshair"
                />
                <line
                    x1={adjustedCenter - radius * Math.cos(Math.PI / 4)}
                    y1={adjustedCenter + radius * Math.sin(Math.PI / 4)}
                    x2={adjustedCenter + radius * Math.cos(Math.PI / 4)}
                    y2={adjustedCenter - radius * Math.sin(Math.PI / 4)}
                    className="panner-crosshair"
                />

                {/* Direction labels */}
                <text x={adjustedCenter} y={adjustedCenter - radius - 8} className="panner-label panner-label-front">
                    FRONT
                </text>
                <text x={adjustedCenter} y={adjustedCenter + radius + 20} className="panner-label panner-label-back">
                    BACK
                </text>
                <text x={adjustedCenter - radius - 25} y={adjustedCenter} className="panner-label panner-label-left">
                    LEFT
                </text>
                <text x={adjustedCenter + radius + 25} y={adjustedCenter} className="panner-label panner-label-right">
                    RIGHT
                </text>

                {/* Position dot */}
                <circle
                    cx={adjustedCenter + dotPos.x}
                    cy={adjustedCenter + dotPos.y}
                    r={12}
                    className="panner-dot"
                />
                <circle
                    cx={adjustedCenter + dotPos.x}
                    cy={adjustedCenter + dotPos.y}
                    r={4}
                    className="panner-dot-inner"
                />
            </svg>
        </div>
    );
};

export default Panner2D;
