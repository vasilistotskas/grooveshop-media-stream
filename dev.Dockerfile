#
# 🧑‍💻 Development
#
FROM node:21.0.0-alpine as development

WORKDIR /usr/src/app

COPY --chown=node:node package*.json ./

RUN npm ci

COPY --chown=node:node . .

USER node
