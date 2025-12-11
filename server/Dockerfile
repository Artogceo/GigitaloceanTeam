FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
# runtime image
FROM node:18-alpine
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production
EXPOSE 4000
VOLUME ["/app/uploads", "/app/data.db"]
CMD ["node", "index.js"]


