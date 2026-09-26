export const mergeRequestHeaders = (...sources) => {
    const merged = {};

    for (const source of sources) {
        if (!source) continue;

        const entries = source instanceof Map
            ? source.entries()
            : typeof source.entries === "function"
                ? source.entries()
                : Object.entries(source);

        for (const [name, value] of entries) {
            if (value === undefined || value === null) continue;

            const key = String(name).toLowerCase();
            if (key === "host") continue;

            merged[key] = String(value);
        }
    }

    return merged;
};

export const getRangeResponseSize = (status, headers) => {
    const normalized = mergeRequestHeaders(headers);

    if (status === 206) {
        const contentRange = normalized["content-range"];
        const match = contentRange?.match(/\/(\d+)$/);
        if (match) {
            const total = Number(match[1]);
            if (Number.isFinite(total) && total > 0) return total;
        }
    }

    if (status === 200) {
        const contentLength = Number(normalized["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > 0) {
            return contentLength;
        }
    }
};
