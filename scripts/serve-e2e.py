"""Serve the repository for browser tests without dropping startup bursts."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class BrowserTestServer(ThreadingHTTPServer):
    # The page loads many ES modules at once. The stdlib default backlog of
    # five caused local ERR_CONNECTION_RESET / ERR_SOCKET_NOT_CONNECTED.
    request_queue_size = 128


if __name__ == "__main__":
    with BrowserTestServer(("127.0.0.1", 8793), SimpleHTTPRequestHandler) as server:
        server.serve_forever()
