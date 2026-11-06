"""Errors shared by the web process and the worker (no OpenCascade import here)."""


class ReadError(Exception):
    """A file the tool can't analyse; the message is shown to the user as is."""
