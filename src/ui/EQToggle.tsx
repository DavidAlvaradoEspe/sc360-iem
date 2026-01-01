/**
 * EQ Toggle Component
 * Checkbox control for enabling/disabling the directional EQ filter
 */

import React from 'react';
import './EQToggle.css';

interface EQToggleProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
}

export const EQToggle: React.FC<EQToggleProps> = ({ enabled, onChange }) => {
    return (
        <div className="eq-toggle-container">
            <label className="eq-toggle-label">
                <input
                    type="checkbox"
                    className="eq-toggle-checkbox"
                    checked={enabled}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <span className="eq-toggle-custom"></span>
                <span className="eq-toggle-text">
                    Front/Back EQ
                    <span className="eq-toggle-hint">Enhances spatial perception</span>
                </span>
            </label>
        </div>
    );
};

export default EQToggle;
