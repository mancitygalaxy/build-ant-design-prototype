#!/usr/bin/env python3
"""Serve this reference library locally on macOS, Windows or Linux."""
from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=0, help='0 selects a free local port')
    parser.add_argument('--open', action='store_true', help='open the library in the default browser')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        url = 'http://127.0.0.1:' + str(server.server_port) + '/'
        print('Reference library: ' + url, flush=True)
        print('Local access only. Press Ctrl+C to stop.', flush=True)
        if args.open:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass

if __name__ == '__main__':
    main()
