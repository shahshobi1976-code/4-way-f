// Safe browser storage wrapper that never throws DOMException (SecurityError)
// in sandboxed iframes or opaque origins, falling back seamlessly to in-memory storage.

const memStorage = new Map<string, string>();
const memSessionStorage = new Map<string, string>();

export const safeStorage = {
    getItem(key: string): string | null {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const val = window.localStorage.getItem(key);
                if (val !== null) return val;
            }
        } catch {
            // DOMException (SecurityError) or access denied
        }
        return memStorage.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.setItem(key, value);
            }
        } catch {
            // DOMException (SecurityError) or access denied
        }
        memStorage.set(key, value);
    },
    removeItem(key: string): void {
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                window.localStorage.removeItem(key);
            }
        } catch {
            // DOMException (SecurityError) or access denied
        }
        memStorage.delete(key);
    },
};

/** Tab-scoped session storage to ensure multi-tab multiplayer instances have independent player identities */
export const safeSessionStorage = {
    getItem(key: string): string | null {
        try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
                const val = window.sessionStorage.getItem(key);
                if (val !== null) return val;
            }
        } catch {
            // Sandboxed iframe restriction
        }
        return memSessionStorage.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
        try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.setItem(key, value);
            }
        } catch {
            // Sandboxed iframe restriction
        }
        memSessionStorage.set(key, value);
    },
    removeItem(key: string): void {
        try {
            if (typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.removeItem(key);
            }
        } catch {
            // Sandboxed iframe restriction
        }
        memSessionStorage.delete(key);
    },
};
