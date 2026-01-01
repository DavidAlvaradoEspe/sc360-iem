/**
 * Quaternion/FOA Bars Component
 * Displays W, X, Y, Z values as horizontal bars
 */

import React from 'react';
import './QuaternionBars.css';

interface WXYZValues {
    w: number;
    x: number;
    y: number;
    z: number;
}

interface QuaternionBarsProps {
    values: WXYZValues;
}

interface BarProps {
    label: string;
    value: number;
    color: string;
}

const Bar: React.FC<BarProps> = ({ label, value, color }) => {
    // Map value from [-1, 1] to percentage for bar width
    // Center is at 50%, full left is 0%, full right is 100%
    const barWidth = Math.abs(value) * 50; // Width as percentage (max 50% each direction)
    const isPositive = value >= 0;

    return (
        <div className="bar-container">
            <div className="bar-label">{label}</div>
            <div className="bar-track">
                {/* Center line */}
                <div className="bar-center" />

                {/* Value bar */}
                <div
                    className={`bar-fill ${isPositive ? 'positive' : 'negative'}`}
                    style={{
                        width: `${barWidth}%`,
                        backgroundColor: color,
                        left: isPositive ? '50%' : `${50 - barWidth}%`,
                    }}
                />
            </div>
            <div className="bar-value">{value.toFixed(2)}</div>
        </div>
    );
};

export const QuaternionBars: React.FC<QuaternionBarsProps> = ({ values }) => {
    const bars = [
        { label: 'W', value: values.w, color: '#ff6b6b' },
        { label: 'X', value: values.x, color: '#4ecdc4' },
        { label: 'Y', value: values.y, color: '#45b7d1' },
        { label: 'Z', value: values.z, color: '#96ceb4' },
    ];

    return (
        <div className="quaternion-bars">
            <div className="bars-header">
                <span className="bars-title">Quaternions</span>
            </div>
            <div className="bars-container">
                {bars.map((bar) => (
                    <Bar
                        key={bar.label}
                        label={bar.label}
                        value={bar.value}
                        color={bar.color}
                    />
                ))}
            </div>
        </div>
    );
};

export default QuaternionBars;
