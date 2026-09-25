const DEFAULT_REFRESH_MS = 5 * 60 * 1000;

export const YOUTUBE_WEB_USER_AGENT =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    + "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    + "Version/15.5 Safari/605.1.15,gzip(gfe)";

export const extractYouTubeVisitorData = (page) => (
    page?.match(/(?:"VISITOR_DATA"|"visitorData"):"([^"]+)"/)?.[1]
);

export const createYouTubeVisitorDataProvider = ({
    refreshMs = DEFAULT_REFRESH_MS,
    now = () => Date.now(),
} = {}) => {
    let cachedVisitorData;
    let refreshedAt = 0;

    return async ({
        videoId,
        dispatcher,
        fetchImpl,
    }) => {
        if (
            cachedVisitorData
            && refreshedAt + refreshMs > now()
        ) {
            return cachedVisitorData;
        }

        if (!videoId || !fetchImpl) {
            return;
        }

        const watchUrl = new URL("https://www.youtube.com/watch");
        watchUrl.searchParams.set("v", videoId);
        watchUrl.searchParams.set("bpctr", "9999999999");
        watchUrl.searchParams.set("has_verified", "1");

        const page = await fetchImpl(watchUrl, {
            dispatcher,
            headers: {
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-us,en;q=0.5",
                Cookie: "PREF=hl=en&tz=UTC; SOCS=CAI",
                "User-Agent": YOUTUBE_WEB_USER_AGENT,
            },
        })
            .then(response => response.ok ? response.text() : undefined)
            .catch(() => undefined);

        const visitorData = extractYouTubeVisitorData(page);

        if (visitorData) {
            cachedVisitorData = visitorData;
            refreshedAt = now();
        }

        return visitorData;
    };
};

export const getYouTubeVisitorData =
    createYouTubeVisitorDataProvider();
