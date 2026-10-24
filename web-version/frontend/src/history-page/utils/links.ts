export function buildPageLink(
    baseParams: URLSearchParams,
    overrides: Record<string, string | number | null | undefined>
): string {
    const params = new URLSearchParams(baseParams);
    Object.entries(overrides).forEach(([key, value]) => {
        if (value === null || value === undefined) {
            params.delete(key);
        } else {
            params.set(key, String(value));
        }
    });
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
}
