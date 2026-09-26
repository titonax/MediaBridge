import test from "node:test";
import assert from "node:assert/strict";

import {
    extractPinterestImageUrls,
    isOriginalPinterestImage,
    selectBestPinterestImage,
    selectPinterestGraphQLImage,
} from "./pinterest-media.js";

const hash = "7c/0a/1c/7c0a1c5f1c999a4a67f3c5b847da093c.jpg";

test("selects the original variant of the first pin image", () => {
    const urls = [
        `https://i.pinimg.com/236x/${hash}`,
        `https://i.pinimg.com/736x/${hash}`,
        `https://i.pinimg.com/originals/${hash}`,
        "https://i.pinimg.com/originals/aa/bb/cc/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg",
    ];

    assert.equal(selectBestPinterestImage(urls), `https://i.pinimg.com/originals/${hash}`);
});

test("does not switch to an unrelated larger image", () => {
    const mainHash = "11/22/33/11111111111111111111111111111111.jpg";
    const unrelatedHash = "aa/bb/cc/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.jpg";

    const urls = [
        `https://i.pinimg.com/236x/${mainHash}`,
        `https://i.pinimg.com/736x/${mainHash}`,
        `https://i.pinimg.com/originals/${unrelatedHash}`,
    ];

    assert.equal(selectBestPinterestImage(urls), `https://i.pinimg.com/736x/${mainHash}`);
});

test("normalizes escaped Pinterest image URLs", () => {
    const html = String.raw`{"url":"https:\/\/i.pinimg.com\/originals\/7c\/0a\/1c\/7c0a1c5f1c999a4a67f3c5b847da093c.jpg"}`;

    assert.deepEqual(
        extractPinterestImageUrls(html),
        [`https://i.pinimg.com/originals/${hash}`],
    );
});

test("prefers GraphQL images_orig", () => {
    const response = {
        data: {
            v3GetPinQueryv2: {
                __typename: "PinResponse",
                data: {
                    images_236x: {
                        width: 236,
                        height: 295,
                        url: `https://i.pinimg.com/236x/${hash}`,
                    },
                    images_orig: {
                        url: `https://i.pinimg.com/originals/${hash}`,
                    },
                },
            },
        },
    };

    assert.equal(
        selectPinterestGraphQLImage(response),
        `https://i.pinimg.com/originals/${hash}`,
    );
});

test("handles responses with no Pinterest image safely", () => {
    assert.equal(selectBestPinterestImage([]), undefined);
    assert.equal(selectPinterestGraphQLImage({}), undefined);
    assert.equal(isOriginalPinterestImage(undefined), false);
});
