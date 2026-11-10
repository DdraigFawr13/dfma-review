"""Options shared by the test folders (an option must be added by a conftest pytest reads first)."""

from __future__ import annotations


def pytest_addoption(parser):
    # Port spec "Browser tests": the e2e suite runs against the Python service (default) or the static site built
    # with the browser engine (web/dist-pages-test, `npm --prefix web run build:pages:test`).
    parser.addoption("--engine", choices=("service", "browser"), default="service",
                     help="e2e: run against the Python service or the browser-engine test build")
