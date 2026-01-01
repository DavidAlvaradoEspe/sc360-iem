/**
 * Creates a throttled version of a function using requestAnimationFrame
 */
export function rafThrottle<T extends (...args: unknown[]) => void>(
    callback: T
): (...args: Parameters<T>) => void {
    let rafId: number | null = null;
    let lastArgs: Parameters<T> | null = null;

    return function (...args: Parameters<T>) {
        lastArgs = args;

        if (rafId === null) {
            rafId = requestAnimationFrame(() => {
                if (lastArgs) {
                    callback(...lastArgs);
                }
                rafId = null;
            });
        }
    };
}

/**
 * Simple throttle function with configurable delay
 */
export function throttle<T extends (...args: unknown[]) => void>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    let lastCall = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return function (...args: Parameters<T>) {
        const now = Date.now();
        const timeSinceLastCall = now - lastCall;

        if (timeSinceLastCall >= delay) {
            lastCall = now;
            callback(...args);
        } else if (!timeoutId) {
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                callback(...args);
                timeoutId = null;
            }, delay - timeSinceLastCall);
        }
    };
}
