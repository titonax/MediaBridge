FROM node:22.21-bookworm-slim AS bgutil-build

ARG BGUTIL_REF=37169ee2656e08c5c2e5dc9df4c598c0cb4c88a8

WORKDIR /opt/bgutil

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       g++ \
       make \
       pkg-config \
       libcairo2-dev \
       libpango1.0-dev \
       libjpeg62-turbo-dev \
       libgif-dev \
       librsvg2-dev \
    && curl -fsSL \
       "https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/${BGUTIL_REF}.tar.gz" \
       -o /tmp/bgutil.tar.gz \
    && tar -xzf /tmp/bgutil.tar.gz --strip-components=1 \
    && rm /tmp/bgutil.tar.gz \
    && cd server \
    && npm ci \
    && npx tsc \
    && npm prune --omit=dev \
    && rm -rf /root/.npm /var/lib/apt/lists/*

FROM node:24-bookworm-slim AS ytdlp

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       python3 \
       python3-venv \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir \
       "yt-dlp[default,curl-cffi]==2026.08.19" \
       "bgutil-ytdlp-pot-provider==2.0.0" \
    && rm -rf /var/lib/apt/lists/*

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

FROM base AS build
WORKDIR /app
COPY . /app

RUN corepack enable
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

RUN pnpm deploy --filter=@imput/cobalt-api --prod /prod/api

FROM base AS api

ENV YOUTUBE_YTDLP_BIN="/opt/venv/bin/yt-dlp"
ENV YOUTUBE_YTDLP_BGUTIL_URL="http://127.0.0.1:4416"

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       curl \
       python3 \
       libcairo2 \
       libpango-1.0-0 \
       libjpeg62-turbo \
       libgif7 \
       librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ytdlp /opt/venv /opt/venv
COPY --from=bgutil-build /opt/bgutil/server /opt/bgutil/server
COPY --from=build --chown=node:node /prod/api /app
COPY --from=build --chown=node:node /app/.git /app/.git
COPY docker/start-api.sh /usr/local/bin/start-mediabridge-api

RUN chmod 0755 /usr/local/bin/start-mediabridge-api \
    && chown -R node:node /opt/bgutil

USER node

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "const p=process.env.API_PORT||9000; fetch('http://127.0.0.1:'+p+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD [ "/usr/local/bin/start-mediabridge-api" ]
