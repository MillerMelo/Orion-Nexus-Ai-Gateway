SHELL := /bin/bash

.PHONY: help init setup up down build logs clean test docker-perms check-hw optimize-model check-ports

help:
	@printf "Make commands:\n"
	@printf "  init           - copy .env.example to .env if missing\n"
	@printf "  up             - detect ports/hardware, pull best model, build and start\n"
	@printf "  down           - stop the stack\n"
	@printf "  build          - prebuild images\n"
	@printf "  logs           - tail the router service logs\n"
	@printf "  clean          - stop and remove containers, networks and images\n"
	@printf "  test           - run the router test suite inside the container\n"
	@printf "  check-ports    - verify port availability, auto-resolve conflicts in .env\n"
	@printf "  check-hw       - show hardware analysis and model recommendation (no pull)\n"
	@printf "  optimize-model - interactive model migration: apply hardware recommendation\n"
	@printf "  setup          - configure git hooks (conventional commits enforcement)\n"

setup:
	@git config core.hooksPath .githooks
	@printf "Git hooks activated. Conventional Commits will be enforced on every commit.\n"

init:
	@if [ ! -f .env ]; then \
		cp .env.example .env && printf "Created .env from template.\n"; \
	else \
		printf ".env already exists, skipping.\n"; \
	fi

up:
	sudo ./scripts/pull-model.sh
	sudo docker compose up --build

down:
	docker compose down

build:
	docker compose build --pull

logs:
	docker compose logs -f router

clean:
	docker compose down --rmi local --remove-orphans

test:
	./scripts/run-tests.sh

check-ports:
	@./scripts/check-ports.sh

check-hw:
	@./scripts/check-hardware.sh

optimize-model:
	sudo ./scripts/pull-model.sh

docker-perms:
	@printf "Adding current user to docker group (requires sudo)...\n"
	@sudo usermod -aG docker $$(id -un)
	@printf "User added to docker group. Please log out/in or run 'exec su -l $$USER' to refresh group membership.\n"
