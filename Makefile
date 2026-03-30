.PHONY: build run help

IMAGE_NAME = scoalanoua-crawler
CONTAINER_NAME = scoalanoua-crawler
PORT = 3000

help:
	@echo "Available targets:"
	@echo "  make build  - Build the Docker image"
	@echo "  make run    - Run the container with --rm flag"

build:
	docker build -t $(IMAGE_NAME) .

run:
	docker run --rm \
		-p $(PORT):3000 \
		--env-file .env \
		--name $(CONTAINER_NAME) \
		$(IMAGE_NAME)

test:
	docker run --rm \
		--env-file .env \
		--name $(CONTAINER_NAME) \
		$(IMAGE_NAME) \
		node src/test.js
