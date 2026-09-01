# Placeholder container for web (P0.01). Thin image so CI `images` (build+scan, pinned digests)
# and deploy provenance run before the service has real logic. Later tickets replace this.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Real build copies the pruned monorepo + built dist; the skeleton just proves the image builds.
COPY apps/web/package.json ./package.json
RUN echo "rhema web placeholder image" > /app/SERVICE
CMD ["node", "-e", "setInterval(function(){}, 1000000000)"]
