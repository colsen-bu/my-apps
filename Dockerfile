# Two stages: build the Vite bundle with the full dev dependency set, then ship
# only `dist/` on nginx. The runtime image carries no node and no node_modules.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
