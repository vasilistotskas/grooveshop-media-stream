FROM node:21.0.0-alpine as development

COPY ./grooveshop-media-stream/docker/docker_entrypoint.sh /app/docker_entrypoint.sh
RUN sed -i 's/\r$//g' /app/docker_entrypoint.sh
RUN chmod +x /app/docker_entrypoint.sh

RUN mkdir -p /mnt/app && \
    chmod 777 -R /mnt/app && \
    chown -R node:node /mnt/app

VOLUME /mnt/app

WORKDIR /mnt/app

USER node

ENTRYPOINT ["/app/docker_entrypoint.sh"]
