import { request } from "undici";
import { Readable } from "node:stream";
import { closeRequest, getHeaders, pipe } from "./shared.js";
import { getRangeResponseSize, mergeRequestHeaders } from "./request-headers.js";
import { handleHlsPlaylist, isHlsResponse, probeInternalHLSTunnel } from "./internal-hls.js";

const CHUNK_SIZE = BigInt(8e6); // 8 MB
const min = (a, b) => a < b ? a : b;

const serviceNeedsChunks = new Set(["youtube", "vk"]);

async function* readChunks(streamInfo, size) {
    let read = 0n, chunksSinceTransplant = 0;
    while (read < size) {
        if (streamInfo.controller.signal.aborted) {
            throw new Error("controller aborted");
        }

        const chunk = await request(streamInfo.url, {
            headers: mergeRequestHeaders(
                getHeaders(streamInfo.service),
                streamInfo.headers,
                {
                    range: `bytes=${read}-${read + CHUNK_SIZE}`,
                }
            ),
            dispatcher: streamInfo.dispatcher,
            signal: streamInfo.controller.signal,
            maxRedirections: 4
        });

        if (chunk.statusCode === 403 && chunksSinceTransplant >= 3 && streamInfo.transplant) {
            chunksSinceTransplant = 0;
            try {
                await streamInfo.transplant(streamInfo.dispatcher);
                continue;
            } catch {}
        }

        chunksSinceTransplant++;

        const expected = min(CHUNK_SIZE, size - read);
        const received = BigInt(chunk.headers['content-length']);

        if (received < expected / 2n) {
            closeRequest(streamInfo.controller);
        }

        for await (const data of chunk.body) {
            yield data;
        }

        read += received;
    }
}

async function handleChunkedStream(streamInfo, res) {
    const { signal } = streamInfo.controller;
    const cleanup = () => (res.end(), closeRequest(streamInfo.controller));

    try {
        let probe, attempts = 3;
        while (attempts--) {
            probe = await fetch(streamInfo.url, {
                headers: mergeRequestHeaders(
                    getHeaders(streamInfo.service),
                    streamInfo.headers,
                    {
                        range: "bytes=0-0",
                    }
                ),
                method: "GET",
                dispatcher: streamInfo.dispatcher,
                signal
            });

            streamInfo.url = probe.url;

            if (probe.status === 403 && streamInfo.transplant) {
                await probe.body?.cancel().catch(() => {});
                try {
                    await streamInfo.transplant(streamInfo.dispatcher);
                    continue;
                } catch {
                    break;
                }
            }

            break;
        }

        if (!probe) return cleanup();

        const sizeValue = getRangeResponseSize(
            probe.status,
            Object.fromEntries(probe.headers)
        );
        const contentType = probe.headers.get("content-type");

        await probe.body?.cancel().catch(() => {});

        if (!sizeValue) {
            return cleanup();
        }

        const size = BigInt(sizeValue);
        const generator = readChunks(streamInfo, size);

        const abortGenerator = () => {
            generator.return();
            signal.removeEventListener("abort", abortGenerator);
        }

        signal.addEventListener("abort", abortGenerator);

        const stream = Readable.from(generator);

        if (contentType) res.setHeader("content-type", contentType);
        res.setHeader("content-length", String(sizeValue));

        pipe(stream, res, cleanup);
    } catch {
        cleanup();
    }
}

async function handleGenericStream(streamInfo, res) {
    const { signal } = streamInfo.controller;
    const cleanup = () => res.end();

    try {
        const fileResponse = await request(streamInfo.url, {
            headers: mergeRequestHeaders(
                getHeaders(streamInfo.service),
                streamInfo.headers
            ),
            dispatcher: streamInfo.dispatcher,
            signal,
            maxRedirections: 16
        });

        res.status(fileResponse.statusCode);
        fileResponse.body.on('error', () => {});

        const isHls = isHlsResponse(fileResponse, streamInfo);

        for (const [ name, value ] of Object.entries(fileResponse.headers)) {
            if (!isHls || name.toLowerCase() !== 'content-length') {
                res.setHeader(name, value);
            }
        }

        if (fileResponse.statusCode < 200 || fileResponse.statusCode > 299) {
            return cleanup();
        }

        if (isHls) {
            await handleHlsPlaylist(streamInfo, fileResponse, res);
        } else {
            pipe(fileResponse.body, res, cleanup);
        }
    } catch {
        closeRequest(streamInfo.controller);
        cleanup();
    }
}

export function internalStream(streamInfo, res) {
    if (streamInfo.headers) {
        streamInfo.headers.delete('icy-metadata');
    }

    if (serviceNeedsChunks.has(streamInfo.service) && !streamInfo.isHLS) {
        return handleChunkedStream(streamInfo, res);
    }

    return handleGenericStream(streamInfo, res);
}

export async function probeInternalTunnel(streamInfo) {
    try {
        const signal = AbortSignal.timeout(3000);
        const headers = mergeRequestHeaders(
            getHeaders(streamInfo.service),
            streamInfo.headers
        );

        if (streamInfo.isHLS) {
            return probeInternalHLSTunnel({
                ...streamInfo,
                signal,
                headers
            });
        }

        const response = await request(streamInfo.url, {
            method: 'HEAD',
            headers,
            dispatcher: streamInfo.dispatcher,
            signal,
            maxRedirections: 16
        });

        if (response.statusCode !== 200)
            throw "status is not 200 OK";

        const size = +response.headers['content-length'];
        if (isNaN(size))
            throw "content-length is not a number";

        return size;
    } catch {}
}
