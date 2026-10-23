# Servidor de La Martina Footgolf (API + app web) en un contenedor.
# Antes de construir la imagen, generá la app web:   npm run build:web      (crea la carpeta "dist")
# Construir:   docker build -t lamartina-footgolf .
# Correr:      docker run -d -p 3000:3000 -v "$PWD/data:/data" -e ADMIN_PASSWORD=una-clave-larga lamartina-footgolf
#
# Nota: esta receta no se pudo probar con Docker en el entorno donde se escribió; el mismo contenido
# (server + src/domain + src/config + dist + tsx) sí se probó corriendo directamente con Node.
FROM node:22-slim
WORKDIR /app
RUN npm init -y >/dev/null && npm install tsx
COPY server ./server
COPY src/domain ./src/domain
COPY src/config ./src/config
COPY dist ./dist
ENV PORT=3000 DB_PATH=/data/footgolf.db STATIC_DIR=/app/dist TRUST_PROXY=0
VOLUME /data
EXPOSE 3000
CMD ["npx", "tsx", "server/index.ts"]
