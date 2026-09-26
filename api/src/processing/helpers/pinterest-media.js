const imageUrlRegex = /https:\/\/i\.pinimg\.com\/[^"'<>\\\s]+?\.(?:jpe?g|png|webp|gif|avif)/gi;
const originalSegments = new Set(["originals", "orig"]);

export function normalizePinterestHtml(value = "") {
    return value
        .replaceAll("\\u002F", "/")
        .replaceAll("\\u0026", "&")
        .replaceAll("\\/", "/")
        .replaceAll("&amp;", "&");
}

export function extractPinterestImageUrls(html) {
    const normalized = normalizePinterestHtml(html);
    return [...new Set(normalized.match(imageUrlRegex) || [])];
}

function mediaPathParts(value) {
    try {
        const url = new URL(value);
        if (url.hostname !== "i.pinimg.com") return;

        const segments = url.pathname.split("/").filter(Boolean);
        const sizeIndex = segments.findIndex((segment) => (
            originalSegments.has(segment)
            || /^\d+x(?:\d+)?$/i.test(segment)
            || /^\d+x\d+_[A-Z]+$/i.test(segment)
        ));

        if (sizeIndex === -1 || sizeIndex === segments.length - 1) return;

        return {
            segments,
            sizeIndex,
            size: segments[sizeIndex],
            identity: segments.slice(sizeIndex + 1).join("/"),
        };
    } catch {
        return;
    }
}

export function pinterestImageQualityScore(url, metadata = {}) {
    const parts = mediaPathParts(url);
    if (!parts) return 0;

    if (originalSegments.has(parts.size)) return Number.MAX_SAFE_INTEGER;

    const dimensions = [metadata.width, metadata.height]
        .map(Number)
        .filter(Number.isFinite);

    if (dimensions.length) return Math.max(...dimensions);

    const match = parts.size.match(/^(\d+)x(?:\d+)?$/i);
    return match ? Number(match[1]) : 0;
}

export function isOriginalPinterestImage(url) {
    const parts = mediaPathParts(url);
    return Boolean(parts && originalSegments.has(parts.size));
}

export function selectBestPinterestImage(urls = []) {
    const usable = urls.filter(Boolean);
    if (!usable.length) return;

    const firstParts = mediaPathParts(usable[0]);
    const sameImage = firstParts
        ? usable.filter((url) => mediaPathParts(url)?.identity === firstParts.identity)
        : [usable[0]];

    return sameImage
        .map((url, index) => ({
            url,
            index,
            score: pinterestImageQualityScore(url),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.url;
}

function collectGraphQLImages(pinData) {
    if (!pinData || typeof pinData !== "object") return [];

    const candidates = [];

    const addCandidate = (key, image) => {
        if (!image || typeof image !== "object" || typeof image.url !== "string") return;
        if (!image.url.startsWith("https://i.pinimg.com/")) return;

        candidates.push({
            key,
            url: image.url,
            width: image.width,
            height: image.height,
        });
    };

    for (const [key, value] of Object.entries(pinData)) {
        if (key.startsWith("images_")) addCandidate(key, value);

        if (key === "images" && value && typeof value === "object") {
            for (const [imageKey, image] of Object.entries(value)) {
                addCandidate(imageKey, image);
            }
        }
    }

    return candidates;
}

export function selectPinterestGraphQLImage(responseData) {
    const pinResponse = responseData?.data?.v3GetPinQueryv2;
    if (!pinResponse || pinResponse.__typename !== "PinResponse") return;

    const candidates = collectGraphQLImages(pinResponse.data);
    if (!candidates.length) return;

    return candidates
        .map((candidate, index) => {
            const originalKey = /(?:^|_)orig(?:inal)?s?$/i.test(candidate.key);
            return {
                ...candidate,
                index,
                score: originalKey
                    ? Number.MAX_SAFE_INTEGER
                    : pinterestImageQualityScore(candidate.url, candidate),
            };
        })
        .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.url;
}
