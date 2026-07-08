.PHONY: all build frontend test run clean

# Build the self-contained release binary (frontend embedded).
all: build

frontend:
	cd frontend && pnpm install && pnpm build

build: frontend
	cargo build --release

# Rust tests (frontend build not required; a placeholder dist is generated).
test:
	cargo test

# Run against the current directory during development.
run: frontend
	cargo run --

clean:
	cargo clean
	rm -rf frontend/dist frontend/node_modules
