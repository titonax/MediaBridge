import { randomBytes } from "node:crypto";

import { genericUserAgent } from "../../config.js";
import {
    extractPinterestImageUrls,
    isOriginalPinterestImage,
    selectBestPinterestImage,
    selectPinterestGraphQLImage,
} from "../helpers/pinterest-media.js";
import { resolveRedirectingURL } from "../url.js";

const videoRegex = /"url":"(https:\/\/v1\.pinimg\.com\/videos\/.*?)"/g;
const notFoundRegex = /"__typename"\s*:\s*"PinNotFound"/;
const graphqlQueryHash = "a5ebb2b085f4c3f33f14ebb7da5ca572bcde8549c478fdccfbaddbbac4f01b92";

function imageExtension(url) {
    try {
        const match = new URL(url).pathname.match(/\.([a-z0-9]+)$/i);
        const extension = match?.[1]?.toLowerCase();
        return extension === "jpeg" ? "jpg" : (extension || "jpg");
    } catch {
        return "jpg";
    }
}

async function fetchFromGraphQL(id) {
    const csrf = randomBytes(16).toString("hex");

    try {
        const response = await fetch("https://www.pinterest.com/_/graphql/", {
            method: "POST",
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "cookie": `csrftoken=${csrf}`,
                "user-agent": genericUserAgent,
                "x-csrftoken": csrf,
                "x-pinterest-appstate": "active",
                "x-requested-with": "XMLHttpRequest",
            },
            body: JSON.stringify({
                queryHash: graphqlQueryHash,
                variables: {
                    pinId: id,
                    isAuth: false,
                    isDesktop: true,
                    shouldPrefetchStoryPinFragment: false,
                    shouldSkipImageViewerOnPageQuery: false,
                    isUnauth: true,
                },
            }),
        });

        if (!response.ok) return;
        return selectPinterestGraphQLImage(await response.json());
    } catch {
        return;
    }
}

export default async function(o) {
    let id = o.id;

    if (!id && o.shortLink) {
        const patternMatch = await resolveRedirectingURL(
            `https://api.pinterest.com/url_shortener/${o.shortLink}/redirect/`
        );
        id = patternMatch?.id;
    }

    if (id?.includes("--")) id = id.split("--")[1];
    if (!id) return { error: "fetch.fail" };

    const html = await fetch(`https://www.pinterest.com/pin/${id}/`, {
        headers: { "user-agent": genericUserAgent }
    }).then(r => r.ok ? r.text() : undefined).catch(() => {});

    if (html?.match(notFoundRegex)) return { error: "fetch.empty" };

    if (html) {
        const normalizedHtml = html
            .replaceAll("\\u002F", "/")
            .replaceAll("\\/", "/");

        const videoLink = [...normalizedHtml.matchAll(videoRegex)]
            .map(([, link]) => link)
            .find(link => link.endsWith(".mp4"));

        if (videoLink) return {
            urls: videoLink,
            filename: `pinterest_${id}.mp4`,
            audioFilename: `pinterest_${id}_audio`
        };
    }

    const htmlImage = selectBestPinterestImage(
        extractPinterestImageUrls(html || "")
    );

    if (htmlImage && isOriginalPinterestImage(htmlImage)) {
        return {
            urls: htmlImage,
            isPhoto: true,
            filename: `pinterest_${id}.${imageExtension(htmlImage)}`
        };
    }

    const graphqlImage = await fetchFromGraphQL(id);
    if (graphqlImage) {
        return {
            urls: graphqlImage,
            isPhoto: true,
            filename: `pinterest_${id}.${imageExtension(graphqlImage)}`
        };
    }

    if (htmlImage) {
        return {
            urls: htmlImage,
            isPhoto: true,
            filename: `pinterest_${id}.${imageExtension(htmlImage)}`
        };
    }

    return { error: html ? "fetch.empty" : "fetch.fail" };
}
