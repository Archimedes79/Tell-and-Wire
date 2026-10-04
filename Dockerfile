# The editor, as one process: the backend serving the built page on :8000.
FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY graph/package.json graph/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 8000
# Nothing to open a browser in: the address is printed.
ENV TW_NO_BROWSER=1
# Bound to every interface because a container's loopback is its own -- and so
# published on the host's loopback only (docker-compose.yml), since nothing here
# asks who is calling. On such a bind the server warns and answers only as
# localhost, the bound address or a name TW_ALLOWED_HOSTS lists. Routes marked
# `local` in backend/app/api.ts (browsing, finding and opening files) answer 403,
# and so does a run that sets a picker's file or folder; opening and saving at any
# path, running code and the settings stay open to whoever reaches the port.
CMD ["node", "backend/app/main.ts", "--editor", "frontend/dist", "--host", "0.0.0.0", "--port", "8000"]
