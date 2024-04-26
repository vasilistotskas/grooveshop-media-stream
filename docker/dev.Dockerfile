FROM node:22.0.0-alpine as development

# Copy the entrypoint script into the container
COPY ./grooveshop-media-stream/docker/docker_entrypoint.sh /app/docker_entrypoint.sh

# Fix potential Windows line endings and make the script executable
RUN sed -i 's/\r$//g' /app/docker_entrypoint.sh && \
    chmod +x /app/docker_entrypoint.sh

# Specify the volume for persistent storage
VOLUME /mnt/app

# Set the working directory
WORKDIR /mnt/app

# Specify the entrypoint script
ENTRYPOINT ["/app/docker_entrypoint.sh"]
