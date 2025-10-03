import { useCallback, useState } from 'react';

export function useBusyMap() {
    const [state, setState] = useState<Record<string, boolean>>({});

    const setBusy = useCallback((urlId: string, busy: boolean) => {
        setState((previous) => {
            if (!urlId) {
                return previous;
            }
            if (!busy && !previous[urlId]) {
                return previous;
            }
            if (busy && previous[urlId]) {
                return previous;
            }
            const next = { ...previous };
            if (busy) {
                next[urlId] = true;
            } else {
                delete next[urlId];
            }
            return next;
        });
    }, []);

    return { state, setBusy } as const;
}
