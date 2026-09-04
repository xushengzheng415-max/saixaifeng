FROM node:20-alpine

WORKDIR /app
COPY core.js index.js server.js state.js test-allowlist.js send-test-welcomes.js configure-kf-env.js package.json ./

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

USER node
CMD ["node", "server.js"]
